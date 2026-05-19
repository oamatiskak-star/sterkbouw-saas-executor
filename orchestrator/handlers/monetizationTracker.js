// Monetization Tracker — Phase 10
//
// Fetcht YouTube Analytics monetary metrics per channel:
//   - estimatedRevenue, estimatedAdRevenue
//   - cpm (cost per mille)
//   - playbackBasedCpm
//   - views
//
// Endpoint: youtubeanalytics.googleapis.com/v2/reports
// Vereist scope yt-analytics-monetary.readonly (NIET in default scopes).
//
// Task payload: { channel_id, period_days? (default 30) }

import { createClient } from '@supabase/supabase-js'
import { logTask } from '../logging.js'

const SUPABASE_URL = process.env.ORCHESTRATOR_SUPABASE_URL ?? process.env.SUPABASE_URL
const SUPABASE_KEY = process.env.ORCHESTRATOR_SUPABASE_SERVICE_ROLE_KEY ?? process.env.SUPABASE_SERVICE_ROLE_KEY

function buildClient() {
  if (!SUPABASE_URL || !SUPABASE_KEY) throw new Error('Supabase env vars ontbreken')
  return createClient(SUPABASE_URL, SUPABASE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
}

async function refreshAccessToken(supabase, cred) {
  if (!cred.refresh_token || !cred.client_id || !cred.client_secret) {
    throw new Error('refresh_token / client_id / client_secret ontbreekt')
  }
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: cred.client_id,
      client_secret: cred.client_secret,
      refresh_token: cred.refresh_token,
      grant_type: 'refresh_token',
    }),
  })
  if (!res.ok) throw new Error(`token refresh ${res.status}: ${(await res.text()).slice(0, 300)}`)
  const j = await res.json()
  const expiresAt = new Date(Date.now() + j.expires_in * 1000).toISOString()
  await supabase.from('platform_credentials').update({
    access_token: j.access_token, expires_at: expiresAt, status: 'connected', updated_at: new Date().toISOString(),
  }).eq('id', cred.id)
  return j.access_token
}

async function ensureAccessToken(supabase, cred) {
  const exp = cred.expires_at ? new Date(cred.expires_at).getTime() : 0
  if (!cred.access_token || (exp - Date.now()) < 5 * 60 * 1000) {
    return await refreshAccessToken(supabase, cred)
  }
  return cred.access_token
}

function isoDate(d) { return d.toISOString().slice(0, 10) }

export async function runMonetizationTracker(task) {
  const supabase = buildClient()
  const payload = task.payload ?? {}
  if (!payload.channel_id) throw new Error('channel_id ontbreekt')

  const periodDays = Math.max(1, Math.min(365, payload.period_days ?? 30))
  const endDate = new Date()
  const startDate = new Date(Date.now() - periodDays * 24 * 60 * 60 * 1000)

  await logTask(task.id, 'info', 'Monetization Tracker gestart', {
    channel_id: payload.channel_id, period_days: periodDays,
  })

  const { data: cred, error: credErr } = await supabase
    .from('platform_credentials')
    .select('*')
    .eq('channel_id', payload.channel_id)
    .eq('platform', 'youtube')
    .single()
  if (credErr || !cred) throw new Error('platform_credentials niet gevonden')
  if (cred.status !== 'connected') throw new Error(`status=${cred.status} (expected: connected)`)
  if (!cred.external_account_id) throw new Error('external_account_id (channelId) ontbreekt')

  const accessToken = await ensureAccessToken(supabase, cred)

  // Build YT Analytics URL — monetary metrics
  const url = new URL('https://youtubeanalytics.googleapis.com/v2/reports')
  url.searchParams.set('ids', `channel==${cred.external_account_id}`)
  url.searchParams.set('startDate', isoDate(startDate))
  url.searchParams.set('endDate', isoDate(endDate))
  url.searchParams.set('metrics', 'views,estimatedRevenue,estimatedAdRevenue,cpm,playbackBasedCpm')

  const res = await fetch(url.toString(), {
    headers: { Authorization: `Bearer ${accessToken}` },
  })

  if (!res.ok) {
    const text = await res.text()
    if (res.status === 403) {
      // Likely insufficient scope (yt-analytics-monetary.readonly)
      await supabase.from('monetization_metrics').insert({
        channel_id: payload.channel_id,
        platform: 'youtube',
        period_start: isoDate(startDate),
        period_end: isoDate(endDate),
        raw_payload: { error: 'scope insufficient', detail: text.slice(0, 300) },
      })
      return {
        ok: true,
        summary: `Monetary scope ontbreekt (403). Voeg yt-analytics-monetary.readonly toe aan platform_credentials.scopes en re-OAuth het kanaal. Empty metric row geinsertet.`,
      }
    }
    throw new Error(`YT Analytics ${res.status}: ${text.slice(0, 400)}`)
  }

  const json = await res.json()
  const headers = (json.columnHeaders ?? []).map((c) => c.name)
  const row = (json.rows ?? [])[0] ?? []
  const get = (name) => {
    const idx = headers.indexOf(name)
    return idx >= 0 ? Number(row[idx]) || 0 : 0
  }

  const views     = get('views')
  const estRev    = get('estimatedRevenue')
  const adRev     = get('estimatedAdRevenue')
  const cpm       = get('cpm')
  const playCpm   = get('playbackBasedCpm')
  const rpm       = views > 0 ? Math.round((estRev / views) * 1000 * 100) / 100 : 0

  // Upsert monetization_metrics
  await supabase.from('monetization_metrics').upsert({
    channel_id: payload.channel_id,
    platform: 'youtube',
    period_start: isoDate(startDate),
    period_end: isoDate(endDate),
    views, estimated_revenue: estRev, ad_revenue: adRev,
    cpm: cpm || null, playback_cpm: playCpm || null, rpm,
    raw_payload: json,
    captured_at: new Date().toISOString(),
  }, { onConflict: 'channel_id,platform,period_start,period_end' })

  // Update monetization_streams (adsense type)
  const monthlyRevenue = Math.round((estRev / periodDays) * 30 * 100) / 100
  await supabase.from('monetization_streams').upsert({
    channel_id: payload.channel_id,
    platform: 'youtube',
    stream_type: 'adsense',
    monthly_revenue: monthlyRevenue,
    active: estRev > 0,
    updated_at: new Date().toISOString(),
  }, { onConflict: 'channel_id,platform,stream_type' })

  return {
    ok: true,
    summary: `Monetization (${periodDays}d): ${views.toLocaleString('nl-NL')} views, €${estRev.toFixed(2)} estimated revenue, RPM €${rpm.toFixed(2)}, CPM €${cpm.toFixed(2)}, monthly proj €${monthlyRevenue.toFixed(2)}`,
  }
}

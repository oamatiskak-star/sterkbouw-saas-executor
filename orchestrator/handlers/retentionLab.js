// Retention Lab — Phase 5
//
// Voor een content_item dat op YouTube gepubliceerd is:
//   1. Vind platform_video_id uit media_holding_uploads
//   2. Refresh OAuth access_token (yt-analytics.readonly scope required)
//   3. Roep YouTube Analytics API aan: audienceWatchRatio +
//      relativeRetentionPerformance per elapsedVideoTimeRatio
//   4. Insert per bucket in retention_lab_samples (second_index = bucket idx)
//   5. Anthropic samenvatting van de curve (drop-off momenten, replay spikes,
//      retentie kwaliteit). Schrijf in content_items.retention_analysis jsonb.
//
// Task payload: { content_item_id }

import Anthropic from '@anthropic-ai/sdk'
import { createClient } from '@supabase/supabase-js'
import { logTask } from '../logging.js'

const SUPABASE_URL = process.env.ORCHESTRATOR_SUPABASE_URL ?? process.env.SUPABASE_URL
const SUPABASE_KEY = process.env.ORCHESTRATOR_SUPABASE_SERVICE_ROLE_KEY ?? process.env.SUPABASE_SERVICE_ROLE_KEY
const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY
const ANTHROPIC_MODEL = process.env.ANTHROPIC_MODEL ?? 'claude-sonnet-4-6'

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
      client_id:     cred.client_id,
      client_secret: cred.client_secret,
      refresh_token: cred.refresh_token,
      grant_type:    'refresh_token',
    }),
  })
  if (!res.ok) {
    const t = await res.text()
    throw new Error(`token refresh ${res.status}: ${t.slice(0, 500)}`)
  }
  const j = await res.json()
  const expiresAt = new Date(Date.now() + (j.expires_in * 1000)).toISOString()
  await supabase.from('platform_credentials').update({
    access_token: j.access_token,
    expires_at:   expiresAt,
    status:       'connected',
    updated_at:   new Date().toISOString(),
  }).eq('id', cred.id)
  return j.access_token
}

async function ensureAccessToken(supabase, cred) {
  const now = Date.now()
  const exp = cred.expires_at ? new Date(cred.expires_at).getTime() : 0
  if (!cred.access_token || (exp - now) < 5 * 60 * 1000) {
    return await refreshAccessToken(supabase, cred)
  }
  return cred.access_token
}

async function fetchAudienceRetention(accessToken, channelId, videoId) {
  // YouTube Analytics API endpoint
  // https://developers.google.com/youtube/analytics/reference/reports/query
  // Voor audience retention: dimensions=elapsedVideoTimeRatio, metrics=audienceWatchRatio,relativeRetentionPerformance
  // filters=video==<id>, ids=channel==<channelId>, startDate=2010-01-01, endDate=<today>
  const today = new Date().toISOString().slice(0, 10)
  const url = new URL('https://youtubeanalytics.googleapis.com/v2/reports')
  url.searchParams.set('ids', `channel==${channelId}`)
  url.searchParams.set('startDate', '2010-01-01')
  url.searchParams.set('endDate', today)
  url.searchParams.set('metrics', 'audienceWatchRatio,relativeRetentionPerformance')
  url.searchParams.set('dimensions', 'elapsedVideoTimeRatio')
  url.searchParams.set('filters', `video==${videoId}`)

  const res = await fetch(url.toString(), {
    headers: { Authorization: `Bearer ${accessToken}` },
  })
  if (!res.ok) {
    const t = await res.text()
    throw new Error(`YouTube Analytics ${res.status}: ${t.slice(0, 500)}`)
  }
  return await res.json()
}

function buildSparkline(samples) {
  // ASCII sparkline van retention_pct (0-100): 8 niveaus
  const levels = '▁▂▃▄▅▆▇█'
  return samples.map((s) => {
    const idx = Math.min(7, Math.max(0, Math.floor((Number(s.retention_pct) / 100) * 8)))
    return levels[idx]
  }).join('')
}

async function analyzeWithAnthropic(brief, samples, sparkline) {
  if (!ANTHROPIC_API_KEY || samples.length === 0) return null
  const anthropic = new Anthropic({ apiKey: ANTHROPIC_API_KEY })

  const dropOffs = samples
    .map((s, i) => ({ i, drop: i > 0 ? Number(samples[i - 1].retention_pct) - Number(s.retention_pct) : 0 }))
    .filter((x) => x.drop > 5)
    .sort((a, b) => b.drop - a.drop)
    .slice(0, 5)

  const userPrompt = [
    '## Content brief',
    `Titel: ${brief?.titel ?? '—'}`,
    `Hook: ${brief?.hook ?? '—'}`,
    `Hook pattern: ${brief?.hook_pattern ?? '—'}`,
    `Retention strategy: ${brief?.retention_strategy ?? '—'}`,
    '',
    '## Retention curve',
    `Buckets: ${samples.length} (each = 1% of video duration)`,
    `Sparkline: ${sparkline}`,
    `Eerste bucket: ${Number(samples[0]?.retention_pct ?? 0).toFixed(1)}%`,
    `Laatste bucket: ${Number(samples[samples.length - 1]?.retention_pct ?? 0).toFixed(1)}%`,
    '',
    '## Grootste drop-offs (>5%)',
    dropOffs.length > 0
      ? dropOffs.map((d) => `- bucket ${d.i} (${d.i}%): -${d.drop.toFixed(1)}%`).join('\n')
      : '(geen significante drops)',
    '',
    '## Opdracht',
    'Geef een korte retentie-analyse (3-5 zinnen) in het Nederlands:',
    '1. Was de hook effectief? (eerste 5 buckets)',
    '2. Waar zijn de grootste drop-offs en waarom waarschijnlijk?',
    '3. Heeft de retention_strategy gewerkt?',
    '4. Een concrete actie om de volgende variant beter te maken.',
  ].join('\n')

  const resp = await anthropic.messages.create({
    model: ANTHROPIC_MODEL,
    max_tokens: 1024,
    messages: [{ role: 'user', content: userPrompt }],
  })

  const text = resp.content
    .filter((c) => c.type === 'text')
    .map((c) => c.text)
    .join('\n')
    .trim()

  return {
    analysis: text,
    sparkline,
    drop_offs: dropOffs,
    avg_retention: samples.reduce((a, s) => a + Number(s.retention_pct), 0) / samples.length,
    hook_retention: samples.slice(0, 5).reduce((a, s) => a + Number(s.retention_pct), 0) / Math.min(5, samples.length),
  }
}

export async function runRetentionLab(task) {
  const supabase = buildClient()
  const payload = task.payload ?? {}
  if (!payload.content_item_id) throw new Error('payload.content_item_id ontbreekt')

  await logTask(task.id, 'info', 'Retention Lab gestart', { content_item_id: payload.content_item_id })

  await supabase.from('media_holding_workers').update({
    status: 'running', last_seen: new Date().toISOString(), last_error: null,
  }).eq('name', 'retention-lab')

  try {
    // 1. Content item + upload
    const { data: item, error: itemErr } = await supabase
      .from('media_holding_content_items')
      .select('id, channel_id, content_brief')
      .eq('id', payload.content_item_id)
      .single()
    if (itemErr || !item) throw new Error(`content_item niet gevonden: ${itemErr?.message ?? 'no row'}`)
    if (!item.channel_id) throw new Error('content_item heeft geen channel_id')

    const { data: upload } = await supabase
      .from('media_holding_uploads')
      .select('platform_video_id')
      .eq('content_item_id', item.id)
      .eq('platform', 'youtube')
      .eq('status', 'verified_live')
      .order('uploaded_at', { ascending: false })
      .limit(1)
      .maybeSingle()
    if (!upload?.platform_video_id) throw new Error('geen verified_live YouTube upload voor dit content_item')

    // 2. Credentials + token refresh
    const { data: cred, error: credErr } = await supabase
      .from('platform_credentials')
      .select('*')
      .eq('channel_id', item.channel_id)
      .eq('platform', 'youtube')
      .single()
    if (credErr || !cred) throw new Error('platform_credentials niet gevonden')
    if (!cred.external_account_id) throw new Error('platform_credentials.external_account_id (channelId) ontbreekt')

    const accessToken = await ensureAccessToken(supabase, cred)

    // 3. Fetch YouTube Analytics
    const analytics = await fetchAudienceRetention(accessToken, cred.external_account_id, upload.platform_video_id)
    await logTask(task.id, 'info', 'Analytics opgehaald', {
      column_headers: analytics.columnHeaders?.map((c) => c.name),
      rows: analytics.rows?.length ?? 0,
    })

    if (!analytics.rows || analytics.rows.length === 0) {
      // Insufficient data — typisch bij verse videos zonder genoeg watch time
      await supabase.from('media_holding_content_items').update({
        retention_analysis: {
          analysis: 'Onvoldoende data. YouTube Analytics vereist genoeg watch time voordat retention curves beschikbaar zijn (typisch >50-100 views).',
          sparkline: null,
          fetched_at: new Date().toISOString(),
        },
        retention_fetched_at: new Date().toISOString(),
      }).eq('id', item.id)

      await supabase.from('media_holding_workers').update({
        status: 'idle', last_seen: new Date().toISOString(),
      }).eq('name', 'retention-lab')

      return { ok: true, summary: 'Onvoldoende analytics data — wacht tot video meer views heeft.' }
    }

    // 4. Insert samples (delete oude eerst)
    await supabase.from('retention_lab_samples').delete().eq('content_item_id', item.id)

    const samples = analytics.rows.map((row) => {
      const [elapsedRatio, audienceWatchRatio /* , relativeRetentionPerformance */] = row
      return {
        content_item_id: item.id,
        second_index: Math.round(Number(elapsedRatio) * 100), // bucket 0-100
        retention_pct: Math.round(Number(audienceWatchRatio) * 1000) / 10, // 0-100, 1 decimal
        drop_off_marker: false,
      }
    })

    // Mark drop-off buckets (>5% lager dan vorige)
    for (let i = 1; i < samples.length; i++) {
      if (Number(samples[i - 1].retention_pct) - Number(samples[i].retention_pct) > 5) {
        samples[i].drop_off_marker = true
      }
    }

    if (samples.length > 0) {
      const { error: insertErr } = await supabase.from('retention_lab_samples').insert(samples)
      if (insertErr) throw new Error(`retention_lab_samples insert: ${insertErr.message}`)
    }

    // 5. AI analyse via Anthropic
    const sparkline = buildSparkline(samples)
    const analysis = await analyzeWithAnthropic(item.content_brief, samples, sparkline)

    await supabase.from('media_holding_content_items').update({
      retention_analysis: { ...analysis, fetched_at: new Date().toISOString() },
      retention_fetched_at: new Date().toISOString(),
    }).eq('id', item.id)

    await supabase.from('media_holding_workers').update({
      status: 'idle', last_seen: new Date().toISOString(),
    }).eq('name', 'retention-lab')

    return {
      ok: true,
      summary: `Retention curve: ${samples.length} buckets, sparkline ${sparkline.slice(0, 50)}…, avg ${analysis?.avg_retention?.toFixed(1)}%, hook (eerste 5%) ${analysis?.hook_retention?.toFixed(1)}%`,
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    await supabase.from('media_holding_workers').update({
      status: 'error', last_error: msg.slice(0, 1000), last_seen: new Date().toISOString(),
    }).eq('name', 'retention-lab')
    throw e
  }
}

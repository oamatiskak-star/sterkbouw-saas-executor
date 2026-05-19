// Affiliate Injector — Phase 13
//
// Voor een content_item: kies de beste affiliate_link (matching channel of niche),
// bouw UTM-getagde URL, en update content_brief.description met affiliate-CTA.
//
// Task payload: { content_item_id, prefer_link_id? }
//
// Selectie-volgorde:
//   1. prefer_link_id wanneer meegegeven en actief
//   2. affiliate_link met channel_id == content_item.channel_id (actief)
//   3. affiliate_link met niche matching channel.niche (actief)
//   4. anders: skip (geen forced injection)

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

function buildTrackedUrl(link, channelKey, contentItemId) {
  const base = link.url
  const tpl = link.utm_template
    ?? 'utm_source=mediaholding&utm_medium=affiliate&utm_campaign={channel}&utm_content={content_item}'
  const utm = tpl
    .replace('{channel}', encodeURIComponent(channelKey ?? 'unknown'))
    .replace('{content_item}', encodeURIComponent(contentItemId.slice(0, 8)))
  return base + (base.includes('?') ? '&' : '?') + utm
}

async function selectLink(supabase, contentItem, channel, preferLinkId) {
  if (preferLinkId) {
    const { data } = await supabase
      .from('affiliate_links')
      .select('*')
      .eq('id', preferLinkId)
      .eq('active', true)
      .maybeSingle()
    if (data) return data
  }
  if (channel?.id) {
    const { data } = await supabase
      .from('affiliate_links')
      .select('*')
      .eq('channel_id', channel.id)
      .eq('active', true)
      .order('commission_pct', { ascending: false, nullsFirst: false })
      .limit(1)
      .maybeSingle()
    if (data) return data
  }
  if (channel?.niche) {
    const { data } = await supabase
      .from('affiliate_links')
      .select('*')
      .eq('niche', channel.niche)
      .eq('active', true)
      .order('commission_pct', { ascending: false, nullsFirst: false })
      .limit(1)
      .maybeSingle()
    if (data) return data
  }
  return null
}

export async function runAffiliateInjector(task) {
  const supabase = buildClient()
  const payload = task.payload ?? {}
  if (!payload.content_item_id) throw new Error('content_item_id ontbreekt')

  await logTask(task.id, 'info', 'Affiliate Injector gestart', { content_item_id: payload.content_item_id })

  const { data: contentItem, error: ciErr } = await supabase
    .from('media_holding_content_items')
    .select('id, title, channel_id, content_brief')
    .eq('id', payload.content_item_id)
    .single()
  if (ciErr || !contentItem) throw new Error(`content_item niet gevonden: ${ciErr?.message ?? 'no row'}`)

  let channel = null
  if (contentItem.channel_id) {
    const { data: ch } = await supabase
      .from('media_holding_channels')
      .select('id, name, naam, niche')
      .eq('id', contentItem.channel_id)
      .maybeSingle()
    channel = ch
  }

  const link = await selectLink(supabase, contentItem, channel, payload.prefer_link_id)
  if (!link) {
    return { ok: true, summary: `Affiliate Injector: geen matching link gevonden voor channel/niche, geen injection.` }
  }

  const channelKey = channel?.name ?? channel?.naam ?? channel?.id ?? 'unknown'
  const trackedUrl = buildTrackedUrl(link, channelKey, contentItem.id)
  const cta = `\n\n— Sponsored: ${link.product} (${link.network ?? 'affiliate'}) → ${trackedUrl}`

  const brief = (contentItem.content_brief && typeof contentItem.content_brief === 'object')
    ? { ...contentItem.content_brief }
    : {}
  const oldDesc = typeof brief.beschrijving === 'string' ? brief.beschrijving : ''
  // Skip als al een affiliate-CTA aanwezig
  if (oldDesc.includes('— Sponsored:')) {
    return { ok: true, summary: `Affiliate Injector: brief bevat al affiliate-CTA, skip.` }
  }
  brief.beschrijving = oldDesc + cta
  brief._affiliate_link_id = link.id
  brief._affiliate_tracked_url = trackedUrl

  const { error: updErr } = await supabase
    .from('media_holding_content_items')
    .update({ content_brief: brief, updated_at: new Date().toISOString() })
    .eq('id', contentItem.id)
  if (updErr) throw new Error(`update content_item fail: ${updErr.message}`)

  return {
    ok: true,
    summary: `Affiliate Injector: ${link.product} (${link.network ?? '?'}) geïnjecteerd in content_item ${contentItem.id.slice(0, 8)} — ${trackedUrl}`,
  }
}

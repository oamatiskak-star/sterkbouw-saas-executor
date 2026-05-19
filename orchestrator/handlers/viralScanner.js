// Viral Intelligence Engine — YouTube Data API v3 scanner
//
// Scant mostPopular per regionCode (NL / US / GB), berekent virality-heuristieken
// en schrijft naar viral_opportunities. De Postgres bridge trigger (migratie 046)
// duwt scores >= 70 automatisch door naar osil_opportunities (category=youtube).
//
// Gebruik:
//   - Direct invoke via orchestrator handler (executor='viral_scanner' task)
//   - Of standalone via `runViralScanYouTube()` import
//
// Environment:
//   - YOUTUBE_API_KEY (verplicht)
//   - SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY (of ORCHESTRATOR_* fallback)

import { createClient } from '@supabase/supabase-js'
import { logTask } from '../logging.js'

const SUPABASE_URL =
  process.env.ORCHESTRATOR_SUPABASE_URL ?? process.env.SUPABASE_URL
const SUPABASE_KEY =
  process.env.ORCHESTRATOR_SUPABASE_SERVICE_ROLE_KEY ??
  process.env.SUPABASE_SERVICE_ROLE_KEY

const YT_KEY = process.env.YOUTUBE_API_KEY

const REGIONS_DEFAULT = ['NL', 'US', 'GB']
const MAX_PER_REGION_DEFAULT = 50

function buildClient() {
  if (!SUPABASE_URL || !SUPABASE_KEY) {
    throw new Error('Supabase URL/key ontbreekt voor viral scanner')
  }
  return createClient(SUPABASE_URL, SUPABASE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
}

function isoDurationToSeconds(iso) {
  if (!iso) return null
  const m = iso.match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/)
  if (!m) return null
  const [, h, mn, s] = m
  return (parseInt(h ?? '0', 10) * 3600) + (parseInt(mn ?? '0', 10) * 60) + parseInt(s ?? '0', 10)
}

function computeScores(item) {
  const views = parseInt(item.statistics?.viewCount ?? '0', 10)
  const likes = parseInt(item.statistics?.likeCount ?? '0', 10)
  const comments = parseInt(item.statistics?.commentCount ?? '0', 10)
  const publishedAt = item.snippet?.publishedAt
  const hoursSince = publishedAt
    ? Math.max(1, (Date.now() - new Date(publishedAt).getTime()) / 3_600_000)
    : 1
  const velocity = views / hoursSince

  // virality = log10(velocity) * 20, clamped 0-100
  const virality = Math.min(100, Math.max(0, Math.round(Math.log10(Math.max(1, velocity)) * 20)))

  // engagement-based automation hint: simpele heuristiek
  // langere video's met lage like-ratio scoren lager als automation candidate
  const duration = isoDurationToSeconds(item.contentDetails?.duration)
  const engagement = views > 0 ? ((likes + comments * 3) / views) : 0
  let automation = 50
  if (duration && duration <= 60) automation += 25 // shorts: hoge automation fit
  if (engagement > 0.05) automation += 10
  if (engagement < 0.01 && duration && duration < 180) automation -= 15
  automation = Math.min(100, Math.max(0, Math.round(automation)))

  // saturation: niet meetbaar zonder niche-clustering; default 50, later via niche-tabel
  const saturation = 50

  // retention: nog niet meetbaar zonder YouTube Analytics API (channel-owner only)
  const retention = 0

  // revenue potential: ruwe €0.50 RPM proxy op views per dag
  const dailyViewsProxy = views / Math.max(1, hoursSince / 24)
  const revenuePotential = Math.round(dailyViewsProxy * 0.0005 * 100) / 100 // €/dag

  return {
    views, likes, comments, velocity,
    virality, automation, saturation, retention,
    revenuePotential, duration, hoursSince,
  }
}

async function fetchTrending(regionCode, maxResults, key) {
  const url = new URL('https://www.googleapis.com/youtube/v3/videos')
  url.searchParams.set('part', 'snippet,statistics,contentDetails')
  url.searchParams.set('chart', 'mostPopular')
  url.searchParams.set('regionCode', regionCode)
  url.searchParams.set('maxResults', String(maxResults))
  url.searchParams.set('key', key)

  const res = await fetch(url.toString())
  if (!res.ok) {
    const text = await res.text()
    throw new Error(`YouTube API ${regionCode} ${res.status}: ${text.slice(0, 500)}`)
  }
  const json = await res.json()
  return json.items ?? []
}

export async function runViralScanYouTube({
  regions = REGIONS_DEFAULT,
  maxPerRegion = MAX_PER_REGION_DEFAULT,
  taskId = null,
} = {}) {
  if (!YT_KEY) {
    throw new Error('YOUTUBE_API_KEY env var niet gezet')
  }
  const supabase = buildClient()

  // Mark worker running
  await supabase.from('media_holding_workers').update({
    status: 'running', last_seen: new Date().toISOString(), last_error: null,
  }).eq('name', 'viral-scanner-youtube')

  if (taskId) await logTask(taskId, 'info', 'Viral scan started', { regions, maxPerRegion })

  let totalFetched = 0
  let totalInserted = 0
  let totalUpdated = 0
  let topVirality = 0
  const errors = []

  try {
    for (const region of regions) {
      let items = []
      try {
        items = await fetchTrending(region, maxPerRegion, YT_KEY)
      } catch (e) {
        errors.push(`${region}: ${e.message}`)
        if (taskId) await logTask(taskId, 'warn', `Region ${region} fetch fail`, { error: e.message })
        continue
      }
      totalFetched += items.length

      const rows = items.map((item) => {
        const s = computeScores(item)
        if (s.virality > topVirality) topVirality = s.virality
        return {
          source_platform: 'youtube',
          external_id: item.id,
          title: item.snippet?.title ?? '(geen titel)',
          url: `https://www.youtube.com/watch?v=${item.id}`,
          thumbnail_url: item.snippet?.thumbnails?.maxres?.url
            ?? item.snippet?.thumbnails?.high?.url
            ?? item.snippet?.thumbnails?.medium?.url
            ?? null,
          channel_name: item.snippet?.channelTitle,
          channel_external_id: item.snippet?.channelId,
          niche: item.snippet?.categoryId ? `youtube_cat_${item.snippet.categoryId}` : null,
          language: item.snippet?.defaultAudioLanguage ?? item.snippet?.defaultLanguage ?? null,
          duration_seconds: s.duration,
          published_at: item.snippet?.publishedAt ?? null,
          views: s.views,
          likes: s.likes,
          comments: s.comments,
          view_velocity: s.velocity,
          retention_score: s.retention,
          saturation_score: s.saturation,
          automation_score: s.automation,
          virality_score: s.virality,
          revenue_potential: s.revenuePotential,
          raw_payload: { region, fetched_at: new Date().toISOString() },
          captured_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        }
      })

      // Upsert: dedupe op (source_platform, external_id). Postgres trigger handelt bridge.
      const { error, count } = await supabase
        .from('viral_opportunities')
        .upsert(rows, { onConflict: 'source_platform,external_id', count: 'exact' })

      if (error) {
        errors.push(`${region} upsert: ${error.message}`)
        if (taskId) await logTask(taskId, 'error', `Region ${region} upsert fail`, { error: error.message })
        continue
      }
      totalInserted += count ?? rows.length
    }

    await supabase.from('media_holding_workers').update({
      status: 'idle',
      last_seen: new Date().toISOString(),
      queue_depth: 0,
      last_error: errors.length ? errors.join(' | ').slice(0, 1000) : null,
    }).eq('name', 'viral-scanner-youtube')

    if (taskId) await logTask(taskId, 'info', 'Viral scan complete', {
      totalFetched, totalInserted, topVirality, errors,
    })

    return { ok: true, totalFetched, totalInserted, totalUpdated, topVirality, errors }
  } catch (e) {
    await supabase.from('media_holding_workers').update({
      status: 'error', last_error: e.message?.slice(0, 1000) ?? String(e),
      last_seen: new Date().toISOString(),
    }).eq('name', 'viral-scanner-youtube')
    if (taskId) await logTask(taskId, 'error', 'Viral scan crashed', { error: e.message })
    throw e
  }
}

// Orchestrator handler — kan via executor='viral_scanner' task triggered worden
export async function runViralScanner(task) {
  const cfg = task.payload?.scanner_config ?? {}
  const result = await runViralScanYouTube({
    regions: cfg.regions ?? REGIONS_DEFAULT,
    maxPerRegion: cfg.max_per_region ?? MAX_PER_REGION_DEFAULT,
    taskId: task.id,
  })
  return {
    ok: true,
    summary: `Viral scan: ${result.totalFetched} videos opgehaald, ${result.totalInserted} upserted, top score ${result.topVirality}${result.errors.length ? `. Fouten: ${result.errors.length}` : ''}`,
  }
}

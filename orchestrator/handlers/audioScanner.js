// Audio Scanner — Phase 7
//
// Scant YouTube Data API mostPopular met videoCategoryId=10 (Music)
// per regionCode. Top music videos op YouTube = de "audio source"
// die in Shorts/Reels viral worden hergebruikt.
//
// Output: audio_library (platform, external_audio_id, name, artist,
// trend_velocity, use_count). Dedupe op (platform, external_audio_id).
//
// Task payload: { regions?: string[], max_per_region?: number }

import { createClient } from '@supabase/supabase-js'
import { logTask } from '../logging.js'

const SUPABASE_URL = process.env.ORCHESTRATOR_SUPABASE_URL ?? process.env.SUPABASE_URL
const SUPABASE_KEY = process.env.ORCHESTRATOR_SUPABASE_SERVICE_ROLE_KEY ?? process.env.SUPABASE_SERVICE_ROLE_KEY
const YT_KEY = process.env.YOUTUBE_API_KEY

const REGIONS_DEFAULT = ['NL', 'US', 'GB']
const MUSIC_CATEGORY_ID = '10'

function buildClient() {
  if (!SUPABASE_URL || !SUPABASE_KEY) throw new Error('Supabase env vars ontbreken')
  return createClient(SUPABASE_URL, SUPABASE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
}

function parseArtist(title, channelTitle) {
  // YouTube music titles vaak in vorm "Artist - Title" of "Artist 'Title'"
  const dashMatch = title.match(/^(.+?)\s+[-–—]\s+(.+)$/)
  if (dashMatch) {
    return { artist: dashMatch[1].trim().slice(0, 200), name: dashMatch[2].trim().slice(0, 200) }
  }
  // Fallback: channel name als artist (vaak VEVO accounts), volledige titel als track name
  return {
    artist: channelTitle?.replace(/VEVO$/i, '').trim()?.slice(0, 200) ?? null,
    name: title.slice(0, 200),
  }
}

async function fetchMusicChart(regionCode, maxResults, key) {
  const url = new URL('https://www.googleapis.com/youtube/v3/videos')
  url.searchParams.set('part', 'snippet,statistics')
  url.searchParams.set('chart', 'mostPopular')
  url.searchParams.set('videoCategoryId', MUSIC_CATEGORY_ID)
  url.searchParams.set('regionCode', regionCode)
  url.searchParams.set('maxResults', String(maxResults))
  url.searchParams.set('key', key)

  const res = await fetch(url.toString())
  if (!res.ok) {
    const t = await res.text()
    throw new Error(`YouTube Music chart ${regionCode} ${res.status}: ${t.slice(0, 300)}`)
  }
  const json = await res.json()
  return json.items ?? []
}

export async function runAudioScanner(task) {
  if (!YT_KEY) throw new Error('YOUTUBE_API_KEY ontbreekt')
  const supabase = buildClient()
  const payload = task.payload ?? {}
  const regions = Array.isArray(payload.regions) && payload.regions.length > 0 ? payload.regions : REGIONS_DEFAULT
  const maxPerRegion = Math.min(50, payload.max_per_region ?? 50)

  await logTask(task.id, 'info', 'Audio scanner gestart', { regions, maxPerRegion })

  // Worker registry — audio scanner kunnen we onder 'analytics-engine' niet vinden;
  // we hebben geen dedicated audio worker. Skip worker update voor nu.

  let totalFetched = 0
  let totalUpserted = 0
  const errors = []

  for (const region of regions) {
    let items = []
    try {
      items = await fetchMusicChart(region, maxPerRegion, YT_KEY)
    } catch (e) {
      errors.push(`${region}: ${e.message}`)
      await logTask(task.id, 'warn', `Region ${region} fetch fail`, { error: e.message })
      continue
    }
    totalFetched += items.length

    const rows = items.map((item) => {
      const views = parseInt(item.statistics?.viewCount ?? '0', 10)
      const publishedAt = item.snippet?.publishedAt
      const hoursSince = publishedAt
        ? Math.max(1, (Date.now() - new Date(publishedAt).getTime()) / 3_600_000)
        : 1
      const velocity = Math.round(views / hoursSince * 100) / 100
      const { artist, name } = parseArtist(item.snippet?.title ?? '', item.snippet?.channelTitle ?? '')

      return {
        platform: 'youtube',
        external_audio_id: item.id,
        name,
        artist,
        trend_velocity: velocity,
        use_count: views,
        captured_at: new Date().toISOString(),
      }
    })

    const { error, count } = await supabase
      .from('audio_library')
      .upsert(rows, { onConflict: 'platform,external_audio_id', count: 'exact' })
    if (error) {
      errors.push(`${region} upsert: ${error.message}`)
      await logTask(task.id, 'error', `Region ${region} upsert fail`, { error: error.message })
      continue
    }
    totalUpserted += count ?? rows.length
  }

  return {
    ok: true,
    summary: `Audio scanner: ${totalFetched} music videos opgehaald, ${totalUpserted} upserted in audio_library${errors.length ? ` (errors: ${errors.length})` : ''}.`,
  }
}

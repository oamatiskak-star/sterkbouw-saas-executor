// Trend Scanner — Phase 13
//
// Twee bronnen:
//   1. Reddit  — top posts uit r/all + Hot lijsten uit gerelateerde subreddits.
//                Public JSON endpoints, geen auth nodig. User-Agent verplicht.
//   2. Google Trends — daily trending searches per region.
//                Geen officiele API. Gebruikt de public RSS feed van
//                trends.google.com/trends/trendingsearches/daily/rss
//
// Output: trend_scanner_signals (source, keyword, momentum, region, raw_payload)
//
// Task payload: { sources?: ['reddit'|'google_trends'], regions?: ['NL','US','GB'] }

import { createClient } from '@supabase/supabase-js'
import { logTask } from '../logging.js'

const SUPABASE_URL = process.env.ORCHESTRATOR_SUPABASE_URL ?? process.env.SUPABASE_URL
const SUPABASE_KEY = process.env.ORCHESTRATOR_SUPABASE_SERVICE_ROLE_KEY ?? process.env.SUPABASE_SERVICE_ROLE_KEY

const USER_AGENT = 'orlando-core-os/0.1 (media-holding trend scanner)'

const REDDIT_SUBS_DEFAULT = ['all', 'popular', 'videos', 'oddlysatisfying', 'interestingasfuck', 'BeAmazed']
const REGIONS_DEFAULT     = ['NL', 'US', 'GB']

function buildClient() {
  if (!SUPABASE_URL || !SUPABASE_KEY) throw new Error('Supabase env vars ontbreken')
  return createClient(SUPABASE_URL, SUPABASE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
}

// ─────────────────────────────────────────────────────────────────────────────
// Reddit
// ─────────────────────────────────────────────────────────────────────────────
async function scanReddit(supabase, subs, taskId) {
  const rows = []
  for (const sub of subs) {
    const url = `https://www.reddit.com/r/${encodeURIComponent(sub)}/top.json?t=day&limit=25`
    try {
      const res = await fetch(url, { headers: { 'User-Agent': USER_AGENT } })
      if (!res.ok) {
        await logTask(taskId, 'warn', `Reddit r/${sub} fetch fail`, { status: res.status })
        continue
      }
      const json = await res.json()
      const posts = json.data?.children ?? []
      for (const p of posts) {
        const d = p.data
        if (!d?.title) continue
        rows.push({
          source: 'reddit',
          keyword: d.title.slice(0, 500),
          momentum: Math.round((d.ups ?? 0) + (d.num_comments ?? 0) * 3),
          region: null,
          raw_payload: {
            subreddit: d.subreddit,
            permalink: d.permalink,
            url: d.url,
            ups: d.ups,
            num_comments: d.num_comments,
            score: d.score,
            created_utc: d.created_utc,
            domain: d.domain,
            is_video: d.is_video,
          },
        })
      }
    } catch (e) {
      await logTask(taskId, 'warn', `Reddit r/${sub} exception`, { error: e.message })
    }
  }
  if (rows.length === 0) return 0
  // Insert (geen dedupe — trend_scanner_signals is een tijdseriereeks)
  const { error, count } = await supabase
    .from('trend_scanner_signals')
    .insert(rows, { count: 'exact' })
  if (error) throw new Error(`reddit insert: ${error.message}`)
  return count ?? rows.length
}

// ─────────────────────────────────────────────────────────────────────────────
// Google Trends (daily RSS feed)
// ─────────────────────────────────────────────────────────────────────────────
//
// Endpoint: https://trends.google.com/trending/rss?geo=<COUNTRY>
// Geen officiele JSON API; XML parsing met regex (geen lib dep nodig).
async function scanGoogleTrends(supabase, regions, taskId) {
  const rows = []
  for (const region of regions) {
    const url = `https://trends.google.com/trending/rss?geo=${encodeURIComponent(region)}`
    try {
      const res = await fetch(url, { headers: { 'User-Agent': USER_AGENT } })
      if (!res.ok) {
        await logTask(taskId, 'warn', `Google Trends ${region} fetch fail`, { status: res.status })
        continue
      }
      const xml = await res.text()
      // Parse <item><title>X</title><ht:approx_traffic>10,000+</ht:approx_traffic>...</item>
      const itemRe = /<item>([\s\S]*?)<\/item>/g
      let match
      while ((match = itemRe.exec(xml)) !== null) {
        const itemXml = match[1]
        const titleMatch  = /<title>(?:<!\[CDATA\[)?([\s\S]*?)(?:\]\]>)?<\/title>/.exec(itemXml)
        const trafficMatch = /<ht:approx_traffic>(?:<!\[CDATA\[)?([\s\S]*?)(?:\]\]>)?<\/ht:approx_traffic>/.exec(itemXml)
        if (!titleMatch) continue
        const title = titleMatch[1].trim()
        if (!title) continue
        const trafficStr = trafficMatch?.[1]?.trim() ?? '0'
        // "10,000+" → 10000
        const traffic = parseInt(trafficStr.replace(/[,+\s]/g, ''), 10) || 0
        rows.push({
          source: 'google_trends',
          keyword: title.slice(0, 500),
          momentum: traffic,
          region,
          raw_payload: { traffic_raw: trafficStr },
        })
      }
    } catch (e) {
      await logTask(taskId, 'warn', `Google Trends ${region} exception`, { error: e.message })
    }
  }
  if (rows.length === 0) return 0
  const { error, count } = await supabase
    .from('trend_scanner_signals')
    .insert(rows, { count: 'exact' })
  if (error) throw new Error(`google_trends insert: ${error.message}`)
  return count ?? rows.length
}

// ─────────────────────────────────────────────────────────────────────────────
// Entry
// ─────────────────────────────────────────────────────────────────────────────
export async function runTrendScanner(task) {
  const supabase = buildClient()
  const payload = task.payload ?? {}
  const sources = Array.isArray(payload.sources) && payload.sources.length > 0
    ? payload.sources
    : ['reddit', 'google_trends']
  const regions = Array.isArray(payload.regions) && payload.regions.length > 0
    ? payload.regions
    : REGIONS_DEFAULT
  const redditSubs = Array.isArray(payload.subreddits) && payload.subreddits.length > 0
    ? payload.subreddits
    : REDDIT_SUBS_DEFAULT

  await logTask(task.id, 'info', 'Trend Scanner gestart', { sources, regions })

  const totals = { reddit: 0, google_trends: 0 }

  if (sources.includes('reddit')) {
    await supabase.from('media_holding_workers').update({
      status: 'running', last_seen: new Date().toISOString(), last_error: null,
    }).eq('name', 'viral-scanner-reddit')
    try {
      totals.reddit = await scanReddit(supabase, redditSubs, task.id)
      await supabase.from('media_holding_workers').update({
        status: 'idle', last_seen: new Date().toISOString(),
      }).eq('name', 'viral-scanner-reddit')
    } catch (e) {
      await supabase.from('media_holding_workers').update({
        status: 'error', last_error: e.message?.slice(0, 1000), last_seen: new Date().toISOString(),
      }).eq('name', 'viral-scanner-reddit')
      throw e
    }
  }

  if (sources.includes('google_trends')) {
    await supabase.from('media_holding_workers').update({
      status: 'running', last_seen: new Date().toISOString(), last_error: null,
    }).eq('name', 'viral-scanner-trends')
    try {
      totals.google_trends = await scanGoogleTrends(supabase, regions, task.id)
      await supabase.from('media_holding_workers').update({
        status: 'idle', last_seen: new Date().toISOString(),
      }).eq('name', 'viral-scanner-trends')
    } catch (e) {
      await supabase.from('media_holding_workers').update({
        status: 'error', last_error: e.message?.slice(0, 1000), last_seen: new Date().toISOString(),
      }).eq('name', 'viral-scanner-trends')
      throw e
    }
  }

  return {
    ok: true,
    summary: `Trend scan: ${totals.reddit} Reddit signalen, ${totals.google_trends} Google Trends signalen ingevoegd.`,
  }
}

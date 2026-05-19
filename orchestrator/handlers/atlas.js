// Atlas — Cross-Platform Distribution
//
// Verwacht: orchestrator_task met executor='atlas_upload' en payload:
//   {
//     content_item_id: uuid,
//     platform: 'youtube' | ...,
//     privacy_status: 'public' | 'unlisted' | 'private',  (default 'unlisted')
//   }
//
// Flow:
//   1. Laad content_item + bijhorende media_holding_channels row
//   2. Laad platform_credentials voor (channel × platform)
//   3. Refresh access_token als verlopen
//   4. Als content_item.output_url null/leeg → return 'no video file' status,
//      maak een media_holding_uploads row met status='failed', persona Atlas
//      heeft dan duidelijk werk klaarstaan zodra render pipeline beschikbaar
//   5. Anders: doe een YouTube Data API resumable upload via output_url
//   6. Slaat platform_video_id op in media_holding_uploads

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
      client_id:     cred.client_id,
      client_secret: cred.client_secret,
      refresh_token: cred.refresh_token,
      grant_type:    'refresh_token',
    }),
  })
  if (!res.ok) {
    const errText = await res.text()
    throw new Error(`token refresh ${res.status}: ${errText.slice(0, 500)}`)
  }
  const j = await res.json()
  const expiresAt = new Date(Date.now() + (j.expires_in * 1000)).toISOString()

  await supabase.from('platform_credentials').update({
    access_token: j.access_token,
    expires_at:   expiresAt,
    status:       'connected',
    updated_at:   new Date().toISOString(),
  }).eq('id', cred.id)

  return { access_token: j.access_token, expires_at: expiresAt }
}

async function ensureAccessToken(supabase, cred) {
  const now = Date.now()
  const exp = cred.expires_at ? new Date(cred.expires_at).getTime() : 0
  // Refresh als minder dan 5 min over of geen access_token
  if (!cred.access_token || (exp - now) < 5 * 60 * 1000) {
    return await refreshAccessToken(supabase, cred)
  }
  return { access_token: cred.access_token, expires_at: cred.expires_at }
}

async function youtubeUpload(accessToken, videoUrl, metadata) {
  // YouTube resumable upload — minimal werkend pad
  // 1. Initialisatie request met metadata
  // 2. Upload video bytes naar de upload URL die we terugkrijgen
  const initRes = await fetch('https://www.googleapis.com/upload/youtube/v3/videos?uploadType=resumable&part=snippet,status', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json; charset=UTF-8',
      'X-Upload-Content-Type': 'video/*',
    },
    body: JSON.stringify({
      snippet: {
        title:       metadata.title?.slice(0, 100) ?? '(geen titel)',
        description: metadata.description ?? '',
        tags:        metadata.tags ?? [],
        categoryId:  metadata.categoryId ?? '22', // People & Blogs default
      },
      status: {
        privacyStatus: metadata.privacy_status ?? 'unlisted',
        selfDeclaredMadeForKids: false,
      },
    }),
  })

  if (!initRes.ok) {
    const t = await initRes.text()
    throw new Error(`YouTube upload init ${initRes.status}: ${t.slice(0, 500)}`)
  }
  const uploadUrl = initRes.headers.get('Location')
  if (!uploadUrl) throw new Error('YouTube upload init: geen Location header')

  // Fetch video bytes en stream naar uploadUrl
  const videoRes = await fetch(videoUrl)
  if (!videoRes.ok) throw new Error(`video file fetch ${videoRes.status}`)
  const videoBuf = await videoRes.arrayBuffer()

  const putRes = await fetch(uploadUrl, {
    method: 'PUT',
    headers: { 'Content-Type': videoRes.headers.get('content-type') ?? 'video/*' },
    body: videoBuf,
  })
  if (!putRes.ok) {
    const t = await putRes.text()
    throw new Error(`YouTube upload PUT ${putRes.status}: ${t.slice(0, 500)}`)
  }
  const result = await putRes.json()
  return result.id
}

export async function runAtlasUpload(task) {
  const supabase = buildClient()
  const payload = task.payload ?? {}

  if (!payload.content_item_id) throw new Error('payload.content_item_id ontbreekt')
  if (!payload.platform)        throw new Error('payload.platform ontbreekt')

  await logTask(task.id, 'info', 'Atlas upload gestart', {
    content_item_id: payload.content_item_id,
    platform:        payload.platform,
  })

  await supabase.from('media_holding_workers').update({
    status: 'running', last_seen: new Date().toISOString(), last_error: null,
  }).eq('name', `upload-engine-${payload.platform}`)

  try {
    // 1. Content item
    const { data: item, error: itemErr } = await supabase
      .from('media_holding_content_items')
      .select('id, channel_id, title, hook, output_url, content_brief, kind, duration_seconds, language')
      .eq('id', payload.content_item_id)
      .single()
    if (itemErr || !item) throw new Error(`content_item niet gevonden: ${itemErr?.message ?? 'no row'}`)
    if (!item.channel_id) throw new Error('content_item heeft geen channel_id — kan niet uploaden naar specifiek kanaal')

    // 2. Credentials
    const { data: cred, error: credErr } = await supabase
      .from('platform_credentials')
      .select('*')
      .eq('channel_id', item.channel_id)
      .eq('platform', payload.platform)
      .single()
    if (credErr || !cred) throw new Error(`geen ${payload.platform}-credentials voor channel ${item.channel_id}`)
    if (cred.status !== 'connected') throw new Error(`platform_credentials.status=${cred.status} (expected: connected)`)

    // 3. Upload row (queued)
    const { data: uploadRow } = await supabase
      .from('media_holding_uploads')
      .insert({
        content_item_id: item.id,
        platform:        payload.platform,
        status:          'queued',
      })
      .select('id')
      .single()

    // 4. Output URL check — zonder render pipeline is dit veld leeg
    if (!item.output_url) {
      const reason = 'no video file: content_item.output_url is leeg. Render pipeline (Phase 2.5) moet eerst het video bestand produceren.'
      await supabase.from('media_holding_uploads').update({
        status: 'failed',
        error:  reason,
        updated_at: new Date().toISOString(),
      }).eq('id', uploadRow.id)

      await supabase.from('media_holding_workers').update({
        status: 'idle', last_seen: new Date().toISOString(),
      }).eq('name', `upload-engine-${payload.platform}`)

      return {
        ok: true,
        summary: `Atlas: upload geweigerd — ${reason} Content item ${item.id} blijft staan met status='${item.kind}'. Pipeline klaar zodra render output beschikbaar is.`,
      }
    }

    // 5. Token refresh + upload
    const { access_token } = await ensureAccessToken(supabase, cred)

    await supabase.from('media_holding_uploads').update({
      status: 'uploading', updated_at: new Date().toISOString(),
    }).eq('id', uploadRow.id)

    if (payload.platform === 'youtube') {
      const meta = {
        title:       item.title ?? item.hook ?? '(geen titel)',
        description: item.content_brief?.beschrijving ?? item.hook ?? '',
        tags:        item.content_brief?.hashtags ?? [],
        categoryId:  '22',
        privacy_status: payload.privacy_status ?? 'unlisted',
      }
      const videoId = await youtubeUpload(access_token, item.output_url, meta)

      await supabase.from('media_holding_uploads').update({
        status: 'verified_live',
        platform_video_id: videoId,
        uploaded_at: new Date().toISOString(),
      }).eq('id', uploadRow.id)

      await supabase.from('media_holding_content_items').update({
        status: 'published',
        published_at: new Date().toISOString(),
      }).eq('id', item.id)

      await supabase.from('media_holding_workers').update({
        status: 'idle', last_seen: new Date().toISOString(),
      }).eq('name', `upload-engine-${payload.platform}`)

      return {
        ok: true,
        summary: `Atlas: ${payload.platform} upload klaar. platform_video_id=${videoId}, status=verified_live. https://www.youtube.com/watch?v=${videoId}`,
      }
    }

    throw new Error(`platform "${payload.platform}" upload-handler niet geïmplementeerd in Atlas Phase 9`)
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    await supabase.from('media_holding_workers').update({
      status: 'error',
      last_error: msg.slice(0, 1000),
      last_seen: new Date().toISOString(),
    }).eq('name', `upload-engine-${payload.platform}`)
    throw e
  }
}

// Renderer — Phase 2.5 video render pipeline via Replicate API
//
// Task payload: { content_item_id, model? }
// Default model: 'minimax/video-01' ($0.083/s — 6s short ≈ $0.50)
// Alternatives:
//   - 'google/veo-3-fast'    (~$0.20/s, premium kwaliteit + native audio)
//   - 'wan-2.2-i2v-fast'     (~$0.05/s, image-to-video — vereist eerst image)
//
// Flow:
//   1. Laad content_item.content_brief (visual_prompt, audio_prompt, duration)
//   2. Maak Replicate prediction via REST API
//   3. Sla prediction.id op in content_item.render_job_id
//   4. Poll prediction status tot succeeded/failed (max 8 min)
//   5. Bij succeeded: download output URL → opslag in content_item.output_url
//   6. Update status='ready' (klaar voor Atlas upload)

import { createClient } from '@supabase/supabase-js'
import { logTask } from '../logging.js'

const SUPABASE_URL = process.env.ORCHESTRATOR_SUPABASE_URL ?? process.env.SUPABASE_URL
const SUPABASE_KEY = process.env.ORCHESTRATOR_SUPABASE_SERVICE_ROLE_KEY ?? process.env.SUPABASE_SERVICE_ROLE_KEY
const REPLICATE_TOKEN = process.env.REPLICATE_API_TOKEN

const POLL_INTERVAL_MS = 5000
const MAX_POLL_MS = 8 * 60 * 1000 // 8 min — meer dan genoeg voor 6s shorts

const MODEL_DEFAULTS = {
  'minimax/video-01': {
    inputBuilder: (brief, dur) => ({
      prompt: [brief.visual_prompt, brief.audio_prompt ? `Audio: ${brief.audio_prompt}` : null].filter(Boolean).join('\n\n'),
      prompt_optimizer: true,
    }),
  },
  'google/veo-3-fast': {
    inputBuilder: (brief, dur) => ({
      prompt: brief.visual_prompt ?? '',
      negative_prompt: '',
      duration: Math.min(8, Math.max(5, dur ?? 6)),
      aspect_ratio: '9:16',
      enhance_prompt: true,
    }),
  },
  'wan-2.2-i2v-fast': {
    inputBuilder: (brief, dur) => ({
      prompt: brief.visual_prompt ?? '',
      // wan-2.2-i2v vereist een input image; fallback op een korte first_frame
      // synth via Flux is buiten scope deze handler — geeft een duidelijke
      // fout terug als geen image_url meegegeven
      num_frames: Math.min(85, Math.max(33, Math.round((dur ?? 6) * 16))),
    }),
  },
}

const ALLOWED_MODELS = Object.keys(MODEL_DEFAULTS)
const DEFAULT_MODEL  = 'minimax/video-01'

function buildClient() {
  if (!SUPABASE_URL || !SUPABASE_KEY) throw new Error('Supabase env vars ontbreken')
  return createClient(SUPABASE_URL, SUPABASE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
}

async function replicateCreate(model, input) {
  // Gebruik Replicate's "Create a prediction" endpoint
  const res = await fetch(`https://api.replicate.com/v1/models/${model}/predictions`, {
    method: 'POST',
    headers: {
      Authorization: `Token ${REPLICATE_TOKEN}`,
      'Content-Type': 'application/json',
      Prefer: 'wait=1', // korte sync wachttijd; daarna pollen
    },
    body: JSON.stringify({ input }),
  })
  if (!res.ok) {
    const t = await res.text()
    throw new Error(`Replicate create ${res.status}: ${t.slice(0, 500)}`)
  }
  return await res.json()
}

async function replicateGet(id) {
  const res = await fetch(`https://api.replicate.com/v1/predictions/${id}`, {
    headers: { Authorization: `Token ${REPLICATE_TOKEN}` },
  })
  if (!res.ok) {
    const t = await res.text()
    throw new Error(`Replicate get ${id} ${res.status}: ${t.slice(0, 200)}`)
  }
  return await res.json()
}

function extractOutputUrl(output) {
  if (!output) return null
  if (typeof output === 'string') return output
  if (Array.isArray(output)) {
    for (const o of output) {
      const u = typeof o === 'string' ? o : (o?.url ?? null)
      if (u) return u
    }
    return null
  }
  if (typeof output === 'object') return output.url ?? output.video ?? null
  return null
}

export async function runRenderer(task) {
  if (!REPLICATE_TOKEN) throw new Error('REPLICATE_API_TOKEN env var niet gezet')
  const supabase = buildClient()
  const payload = task.payload ?? {}

  if (!payload.content_item_id) throw new Error('payload.content_item_id ontbreekt')

  const model = ALLOWED_MODELS.includes(payload.model) ? payload.model : DEFAULT_MODEL

  await logTask(task.id, 'info', 'Renderer gestart', {
    content_item_id: payload.content_item_id, model,
  })

  await supabase.from('media_holding_workers').update({
    status: 'running', last_seen: new Date().toISOString(), last_error: null,
  }).eq('name', 'content-renderer-default')

  try {
    // 1. Content item
    const { data: item, error: itemErr } = await supabase
      .from('media_holding_content_items')
      .select('id, content_brief, duration_seconds, status, output_url')
      .eq('id', payload.content_item_id)
      .single()
    if (itemErr || !item) throw new Error(`content_item niet gevonden: ${itemErr?.message ?? 'no row'}`)
    if (!item.content_brief) throw new Error('content_brief is leeg — render Forge brief eerst')

    // 2. Mark rendering
    await supabase.from('media_holding_content_items').update({
      status: 'rendering',
      render_model: model,
      render_started_at: new Date().toISOString(),
      render_logs: null,
    }).eq('id', item.id)

    // 3. Build input + create prediction
    const builder = MODEL_DEFAULTS[model].inputBuilder
    const input = builder(item.content_brief, item.duration_seconds)

    if (model === 'wan-2.2-i2v-fast' && !payload.image_url) {
      throw new Error(`${model} vereist payload.image_url (image-to-video). Geef eerst een first-frame image.`)
    }
    if (payload.image_url) input.image = payload.image_url

    const prediction = await replicateCreate(model, input)
    await logTask(task.id, 'info', `Replicate prediction ${prediction.id} gemaakt`, { status: prediction.status })

    await supabase.from('media_holding_content_items').update({
      render_job_id: prediction.id,
    }).eq('id', item.id)

    // 4. Poll
    const start = Date.now()
    let current = prediction
    while (current.status !== 'succeeded' && current.status !== 'failed' && current.status !== 'canceled') {
      if (Date.now() - start > MAX_POLL_MS) {
        throw new Error(`Replicate poll timeout na ${MAX_POLL_MS / 1000}s — prediction ${current.id} status=${current.status}`)
      }
      await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS))
      current = await replicateGet(prediction.id)
    }

    const logs = typeof current.logs === 'string' ? current.logs.slice(-2000) : null

    if (current.status === 'failed' || current.status === 'canceled') {
      await supabase.from('media_holding_content_items').update({
        status: 'failed',
        failure_reason: current.error ?? `prediction status=${current.status}`,
        render_logs: logs,
      }).eq('id', item.id)
      throw new Error(`Replicate prediction ${current.id} ${current.status}: ${current.error ?? '(no error)'}`)
    }

    // 5. Success
    const outputUrl = extractOutputUrl(current.output)
    if (!outputUrl) {
      await supabase.from('media_holding_content_items').update({
        status: 'failed',
        failure_reason: 'prediction succeeded maar geen output URL gevonden',
        render_logs: logs,
      }).eq('id', item.id)
      throw new Error('Replicate prediction had geen output URL')
    }

    await supabase.from('media_holding_content_items').update({
      status: 'ready',
      output_url: outputUrl,
      render_logs: logs,
      rendered_at: new Date().toISOString(),
    }).eq('id', item.id)

    await supabase.from('media_holding_workers').update({
      status: 'idle', last_seen: new Date().toISOString(),
    }).eq('name', 'content-renderer-default')

    return {
      ok: true,
      summary: `Renderer klaar (model=${model}): ${outputUrl}`,
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    await supabase.from('media_holding_workers').update({
      status: 'error', last_error: msg.slice(0, 1000), last_seen: new Date().toISOString(),
    }).eq('name', 'content-renderer-default')
    throw e
  }
}

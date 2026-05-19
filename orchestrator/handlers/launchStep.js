// Launch Step — Phase 14
//
// Universal handler die per step_key het juiste werk uitvoert binnen een
// channel_launch_plan. Bij completion: trigger 072 advanced automatisch
// naar de volgende step.
//
// Step routing:
//   project_setup           → mark completed (folder/access setup is admin-level)
//   youtube_channel_create  → mark blocked (handmatige Google Brand Account)
//   google_console_setup    → mark blocked (handmatige OAuth credentials)
//   branding_logo           → Replicate FLUX: logo + banner + thumbnail
//   seo_research            → Anthropic: niche keywords + competitor pillars
//   seo_write               → Anthropic: channel description + tags + default upload meta
//   audio_production        → Replicate music gen: theme + library samples
//   video_production        → mark completed (handover naar bestaande renderer pipeline)
//   dashboard_publish       → DB: channel.status=live (al gedaan, hier alleen confirm)
//   first_upload            → dispatch atlas_upload task voor eerste content_item

import { createClient } from '@supabase/supabase-js'
import Anthropic from '@anthropic-ai/sdk'
import { logTask } from '../logging.js'

const SUPABASE_URL  = process.env.ORCHESTRATOR_SUPABASE_URL  ?? process.env.SUPABASE_URL
const SUPABASE_KEY  = process.env.ORCHESTRATOR_SUPABASE_SERVICE_ROLE_KEY ?? process.env.SUPABASE_SERVICE_ROLE_KEY
const ANTHROPIC_KEY = process.env.ANTHROPIC_API_KEY
const REPLICATE_TOKEN = process.env.REPLICATE_API_TOKEN
const ANTHROPIC_MODEL = process.env.ANTHROPIC_MODEL ?? 'claude-sonnet-4-6'

function buildSupabase() {
  if (!SUPABASE_URL || !SUPABASE_KEY) throw new Error('Supabase env vars ontbreken')
  return createClient(SUPABASE_URL, SUPABASE_KEY, { auth: { persistSession: false, autoRefreshToken: false } })
}

async function markStep(supabase, stepId, status, output, blocker_reason = null) {
  const patch = { status, output: output ?? {}, updated_at: new Date().toISOString() }
  if (blocker_reason) patch.blocker_reason = blocker_reason
  const { error } = await supabase.from('channel_launch_steps').update(patch).eq('id', stepId)
  if (error) throw new Error(`step update fail: ${error.message}`)
}

// ─── REPLICATE HELPERS ───────────────────────────────────────────────────────

async function replicateRun(version, input, { pollMs = 3000, maxTries = 100 } = {}) {
  if (!REPLICATE_TOKEN) throw new Error('REPLICATE_API_TOKEN ontbreekt')
  const create = await fetch('https://api.replicate.com/v1/predictions', {
    method: 'POST',
    headers: {
      'Authorization': `Token ${REPLICATE_TOKEN}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ version, input }),
  })
  if (!create.ok) throw new Error(`replicate create fail: ${create.status} ${await create.text()}`)
  const job = await create.json()
  let url = job.urls?.get
  for (let i = 0; i < maxTries; i++) {
    await new Promise((r) => setTimeout(r, pollMs))
    const poll = await fetch(url, { headers: { 'Authorization': `Token ${REPLICATE_TOKEN}` } })
    const data = await poll.json()
    if (data.status === 'succeeded') return data.output
    if (data.status === 'failed' || data.status === 'canceled') throw new Error(`replicate ${data.status}: ${data.error}`)
  }
  throw new Error('replicate timeout')
}

// ─── STEP RUNNERS ───────────────────────────────────────────────────────────

async function runProjectSetup(supabase, payload) {
  // Project entity-setup: enkele DB markers
  const { data: plan } = await supabase
    .from('channel_launch_plans')
    .select('id, project_name, niche')
    .eq('id', payload.plan_id)
    .single()
  return {
    folder: `/launches/${plan?.id}`,
    project_name: plan?.project_name,
    niche: plan?.niche,
    note: 'Project entity initialized in OS. Folder placeholder ready.',
  }
}

async function runYoutubeChannelCreate(supabase, payload) {
  // Handmatige Google Brand Account stap — niet automatiseerbaar
  return {
    blocked: true,
    blocker_reason: 'Handmatige actie vereist: maak Google Brand Account aan voor "' + payload.project_name + '" en koppel als YouTube channel.',
    next_action_url: 'https://www.youtube.com/account',
  }
}

async function runGoogleConsoleSetup(supabase, payload) {
  return {
    blocked: true,
    blocker_reason: 'Handmatige actie vereist: maak OAuth client in Google Cloud Console, enable YouTube Data API + Analytics API, doe OAuth-flow.',
    next_action_url: 'https://console.cloud.google.com/apis/credentials',
  }
}

async function runBrandingLogo(supabase, payload) {
  // FLUX schnell (snel + goedkoop) voor logo + banner
  const logoVersion = 'black-forest-labs/flux-schnell'  // gebruik latest via model-name shorthand
  const niche = payload.niche ?? 'general'
  const name = payload.project_name?.slice(0, 40) ?? 'Channel'

  // Replicate model latest version moet via API call. Voor MVP: gebruik FLUX schnell endpoint die model-by-name accepteert.
  // Endpoint: POST /v1/models/black-forest-labs/flux-schnell/predictions
  if (!REPLICATE_TOKEN) {
    return { skipped: 'REPLICATE_API_TOKEN ontbreekt — branding handmatig invullen' }
  }

  async function fluxRun(prompt, aspect = '1:1') {
    const r = await fetch('https://api.replicate.com/v1/models/black-forest-labs/flux-schnell/predictions', {
      method: 'POST',
      headers: { 'Authorization': `Token ${REPLICATE_TOKEN}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ input: { prompt, aspect_ratio: aspect, num_outputs: 1, output_format: 'webp' } }),
    })
    if (!r.ok) throw new Error(`flux create fail: ${r.status}`)
    const job = await r.json()
    for (let i = 0; i < 60; i++) {
      await new Promise((res) => setTimeout(res, 2000))
      const p = await fetch(job.urls.get, { headers: { 'Authorization': `Token ${REPLICATE_TOKEN}` } })
      const d = await p.json()
      if (d.status === 'succeeded') return Array.isArray(d.output) ? d.output[0] : d.output
      if (d.status === 'failed') throw new Error(`flux failed: ${d.error}`)
    }
    throw new Error('flux timeout')
  }

  const logoUrl    = await fluxRun(`Minimalistic flat logo for YouTube channel "${name}", niche: ${niche}. Bold geometric shape, single accent color, white background, vector style, no text.`, '1:1')
  const bannerUrl  = await fluxRun(`Wide YouTube channel banner for "${name}" (niche: ${niche}). Cinematic atmospheric background, abstract gradient, modern design, no text.`, '16:9')
  const thumbnail  = await fluxRun(`Bold YouTube thumbnail template for niche ${niche}. Eye-catching face/emotion, contrasting colors, dramatic lighting, professional, no text.`, '16:9')

  // Update channel branding als channel bestaat
  if (payload.channel_id) {
    await supabase.from('media_holding_channels').update({
      branding: { logo_url: logoUrl, banner_url: bannerUrl, thumbnail_template: thumbnail, auto_generated: true },
      updated_at: new Date().toISOString(),
    }).eq('id', payload.channel_id)
  }

  return { logo_url: logoUrl, banner_url: bannerUrl, thumbnail_template: thumbnail }
}

async function runAnthropicJson(systemPrompt, userPrompt) {
  if (!ANTHROPIC_KEY) throw new Error('ANTHROPIC_API_KEY ontbreekt')
  const client = new Anthropic({ apiKey: ANTHROPIC_KEY })
  const r = await client.messages.create({
    model: ANTHROPIC_MODEL,
    max_tokens: 2000,
    system: systemPrompt,
    messages: [{ role: 'user', content: userPrompt + '\n\nAntwoord ALLEEN met geldig JSON, geen prefix tekst.' }],
  })
  const text = r.content?.[0]?.type === 'text' ? r.content[0].text : ''
  const match = text.match(/\{[\s\S]*\}/)
  if (!match) throw new Error('geen JSON in Anthropic response')
  return JSON.parse(match[0])
}

async function runSeoResearch(supabase, payload) {
  const json = await runAnthropicJson(
    'Je bent Vortex, een YouTube-SEO specialist. Doe diepe niche research en geef strategisch advies.',
    `Channel: "${payload.project_name}" (niche: ${payload.niche ?? 'general'}, taal: ${payload.language ?? 'nl'})

Geef terug als JSON met velden:
- primary_keywords: array van 10 high-intent zoektermen
- long_tail_keywords: array van 15 long-tail zoektermen
- content_pillars: array van 5 thema's met elk { name, description, video_topics: [5 ideeen] }
- top_competitors: array van 3 channels (naam + reden)
- target_audience: { demo, interests, pain_points }
- positioning_statement: 1 zin
- estimated_monthly_searches: nummer (geschat)`
  )
  return json
}

async function runSeoWrite(supabase, payload) {
  // Lees research output van vorige step
  const { data: researchStep } = await supabase
    .from('channel_launch_steps')
    .select('output')
    .eq('plan_id', payload.plan_id)
    .eq('step_key', 'seo_research')
    .maybeSingle()

  const research = researchStep?.output ?? {}

  const json = await runAnthropicJson(
    'Je bent Vortex, copywriter voor YouTube channels. Schrijf SEO-geoptimaliseerd meta-content.',
    `Channel: "${payload.project_name}" (niche: ${payload.niche ?? 'general'}, taal: ${payload.language ?? 'nl'})
Research context: ${JSON.stringify(research).slice(0, 2000)}

Geef terug als JSON met velden:
- channel_description: 1000 tokens max, hooks/keywords ingewerkt
- channel_tags: array van 15 tags
- default_upload_title_template: string met placeholders {topic} {hook} {brand}
- default_upload_description_template: multi-paragraph string met placeholders
- default_upload_tags: array van 20
- channel_handle_suggestions: array van 5 (@-stijl)`
  )

  // Update channel description als channel bestaat
  if (payload.channel_id) {
    await supabase.from('media_holding_channels').update({
      branding: { seo: json, auto_generated: true },
      updated_at: new Date().toISOString(),
    }).eq('id', payload.channel_id)
  }

  return json
}

async function runAudioProduction(supabase, payload) {
  if (!REPLICATE_TOKEN) {
    return { skipped: 'REPLICATE_API_TOKEN ontbreekt — audio handmatig invullen' }
  }

  // MusicGen via Replicate (meta/musicgen) — produceer theme music
  const prompt = `Cinematic ${payload.niche ?? 'general'} channel intro music, energetic, modern, 20 second loop, professional production`

  async function musicgenRun() {
    const r = await fetch('https://api.replicate.com/v1/models/meta/musicgen/predictions', {
      method: 'POST',
      headers: { 'Authorization': `Token ${REPLICATE_TOKEN}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ input: { prompt, duration: 20, output_format: 'mp3', normalization_strategy: 'peak' } }),
    })
    if (!r.ok) throw new Error(`musicgen create fail: ${r.status} ${await r.text()}`)
    const job = await r.json()
    for (let i = 0; i < 120; i++) {
      await new Promise((res) => setTimeout(res, 3000))
      const p = await fetch(job.urls.get, { headers: { 'Authorization': `Token ${REPLICATE_TOKEN}` } })
      const d = await p.json()
      if (d.status === 'succeeded') return Array.isArray(d.output) ? d.output[0] : d.output
      if (d.status === 'failed') throw new Error(`musicgen failed: ${d.error}`)
    }
    throw new Error('musicgen timeout')
  }

  const themeUrl = await musicgenRun()
  return { theme_music_url: themeUrl, prompt }
}

async function runVideoProduction(supabase, payload) {
  // Video productie wordt gedaan door bestaande renderer chain (Forge brief → render)
  // Hier alleen de stap markeren als handover compleet
  const { count } = await supabase
    .from('media_holding_content_items')
    .select('id', { count: 'exact', head: true })
    .eq('channel_id', payload.channel_id ?? '00000000-0000-0000-0000-000000000000')
    .eq('status', 'ready')

  return {
    note: 'Video productie loopt via standaard Forge → Renderer pipeline. Volgende auto-launch tasks renderen content.',
    ready_count: count ?? 0,
  }
}

async function runDashboardPublish(supabase, payload) {
  if (payload.channel_id) {
    await supabase.from('media_holding_channels').update({
      status: 'live',
      launched_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }).eq('id', payload.channel_id)
  }
  return { channel_published: true, channel_id: payload.channel_id }
}

async function runFirstUpload(supabase, payload) {
  // Vind eerste ready content_item voor deze channel
  const { data: item } = await supabase
    .from('media_holding_content_items')
    .select('id, title, output_url')
    .eq('channel_id', payload.channel_id ?? '00000000-0000-0000-0000-000000000000')
    .eq('status', 'ready')
    .not('output_url', 'is', null)
    .order('created_at', { ascending: true })
    .limit(1)
    .maybeSingle()

  if (!item) {
    return {
      blocked: true,
      blocker_reason: 'Geen ready content_item met output_url voor deze channel. Wacht tot video_production klaar is.',
    }
  }

  const { data: task, error } = await supabase.from('orchestrator_tasks').insert({
    company_id: 'modiwerijo',
    title: `[first-upload] ${item.title?.slice(0, 50)}`,
    task_type: 'first_upload',
    executor: 'atlas_upload',
    allowed_actions: ['*'],
    priority: 2,
    status: 'open',
    objective: [`Eerste upload van channel naar YouTube.`],
    payload: { content_item_id: item.id, platform: 'youtube', persona: 'Atlas', launch_step_first_upload: true },
  }).select('id').single()
  if (error) throw new Error(`first_upload dispatch fail: ${error.message}`)

  return { dispatched_task_id: task.id, content_item_id: item.id }
}

// ─── ENTRY POINT ─────────────────────────────────────────────────────────────

const STEP_RUNNERS = {
  project_setup:          runProjectSetup,
  youtube_channel_create: runYoutubeChannelCreate,
  google_console_setup:   runGoogleConsoleSetup,
  branding_logo:          runBrandingLogo,
  seo_research:           runSeoResearch,
  seo_write:              runSeoWrite,
  audio_production:       runAudioProduction,
  video_production:       runVideoProduction,
  dashboard_publish:      runDashboardPublish,
  first_upload:           runFirstUpload,
}

export async function runLaunchStep(task) {
  const supabase = buildSupabase()
  const payload = task.payload ?? {}
  const { step_id, step_key } = payload

  if (!step_id || !step_key) throw new Error('step_id en step_key vereist')
  await logTask(task.id, 'info', `Launch step gestart: ${step_key}`, { step_id, step_key })

  const runner = STEP_RUNNERS[step_key]
  if (!runner) {
    await markStep(supabase, step_id, 'blocked', { unknown: step_key }, `Onbekende step_key: ${step_key}`)
    throw new Error(`onbekende step_key: ${step_key}`)
  }

  let output
  try {
    output = await runner(supabase, payload)
  } catch (e) {
    await markStep(supabase, step_id, 'blocked', { error: e.message }, e.message)
    throw e
  }

  if (output?.blocked) {
    await markStep(supabase, step_id, 'blocked', output, output.blocker_reason)
    return {
      ok: false,
      summary: `Step ${step_key} blocked: ${output.blocker_reason}`,
    }
  }

  if (output?.skipped) {
    await markStep(supabase, step_id, 'skipped', output)
    return { ok: true, summary: `Step ${step_key} skipped: ${output.skipped}` }
  }

  await markStep(supabase, step_id, 'completed', output)
  return {
    ok: true,
    summary: `Step ${step_key} completed.`,
    output: output && typeof output === 'object' ? Object.keys(output).slice(0, 5) : null,
  }
}

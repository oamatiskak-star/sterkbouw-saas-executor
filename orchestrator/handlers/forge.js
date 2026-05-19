// Forge — Content Factory brief generator
//
// Genereert via Anthropic API een content brief op basis van:
//   - task.payload.viral_opportunity_id   → gebruikt source viral_opportunities row als inspiratie
//   - task.payload.channel_id             → genereert brief in de niche van het kanaal
//   - task.payload.brief                  → vrij prompt
//
// Output wordt geschreven naar media_holding_content_items.content_brief (jsonb).
// Status van het content_item gaat van 'pending' → 'ready' (render is een aparte
// stap in Phase 2.5).

import Anthropic from '@anthropic-ai/sdk'
import { createClient } from '@supabase/supabase-js'
import { logTask } from '../logging.js'

const SUPABASE_URL = process.env.ORCHESTRATOR_SUPABASE_URL ?? process.env.SUPABASE_URL
const SUPABASE_KEY = process.env.ORCHESTRATOR_SUPABASE_SERVICE_ROLE_KEY ?? process.env.SUPABASE_SERVICE_ROLE_KEY
const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY
const ANTHROPIC_MODEL = process.env.ANTHROPIC_MODEL ?? 'claude-sonnet-4-6'

const BRIEF_SCHEMA = {
  name: 'content_brief',
  description: 'Gestructureerde content brief voor een YouTube Short / Reel / TikTok.',
  input_schema: {
    type: 'object',
    required: ['titel','hook','beschrijving','visual_prompt','audio_prompt','duration_target','suggested_kind'],
    properties: {
      titel:            { type: 'string', description: 'Click-worthy titel max 70 chars.' },
      hook:             { type: 'string', description: 'Eerste 0-3 sec opening die de kijker vasthoudt. 1 zin.' },
      beschrijving:     { type: 'string', description: 'Beschrijving / caption voor de upload.' },
      visual_prompt:    { type: 'string', description: 'Zeer specifieke visuele prompt voor video-generation model.' },
      audio_prompt:     { type: 'string', description: 'Geluid/muziek/voice-over beschrijving.' },
      duration_target:  { type: 'integer', description: 'Doelduur in seconden (typisch 15-60 voor shorts).' },
      suggested_kind:   {
        type: 'string',
        enum: ['short','reel','long','loop','asmr','satisfying','cutting','marble','mini_world','ai_visual','remix','compilation'],
      },
      hashtags:         { type: 'array', items: { type: 'string' }, description: 'Max 10 platform-agnostische hashtags zonder #' },
      hook_pattern:     { type: 'string', description: 'Type hook (visual_shock, curiosity_gap, pattern_break, dopamine_hit, etc).' },
      retention_strategy:{ type: 'string', description: 'Wat houdt de kijker tot het einde? 1-2 zinnen.' },
      replay_friendly:  { type: 'boolean' },
    },
  },
}

function buildClient() {
  if (!SUPABASE_URL || !SUPABASE_KEY) throw new Error('Supabase env vars ontbreken')
  return createClient(SUPABASE_URL, SUPABASE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
}

function buildSystemPrompt() {
  return [
    'Je bent Forge, de Content Factory persona binnen Orlando Core OS Media Holding.',
    'Je vertaalt viral signalen en kanaal-niches naar concrete, render-klare content briefs.',
    'Schrijf de brief in het Nederlands tenzij anders gevraagd. Visual/audio prompts mogen in het Engels voor compatibiliteit met gen-modellen.',
    'Eindig altijd met de content_brief tool.',
  ].join(' ')
}

async function buildUserPrompt(supabase, payload) {
  const parts = []
  parts.push('## Context')

  if (payload.viral_opportunity_id) {
    const { data: opp } = await supabase
      .from('viral_opportunities')
      .select('title, channel_name, source_platform, views, view_velocity, virality_score, niche, language, url')
      .eq('id', payload.viral_opportunity_id)
      .single()
    if (opp) {
      parts.push(
        '### Geïnspireerd door virale kans',
        `- Platform: ${opp.source_platform}`,
        `- Origineel kanaal: ${opp.channel_name ?? '—'}`,
        `- Titel referentie: "${opp.title ?? '—'}"`,
        `- Views: ${opp.views ?? 0} | velocity: ${Math.round(opp.view_velocity ?? 0)}/uur | virality: ${opp.virality_score ?? 0}`,
        `- Niche: ${opp.niche ?? '—'} | taal: ${opp.language ?? '—'}`,
        `- URL: ${opp.url ?? '—'}`,
      )
    }
  }

  if (payload.channel_id) {
    const { data: ch } = await supabase
      .from('media_holding_channels')
      .select('name, niche, language, target_views_10d, branding, upload_strategy')
      .eq('id', payload.channel_id)
      .single()
    if (ch) {
      parts.push(
        '### Doelkanaal',
        `- Naam: ${ch.name}`,
        `- Niche: ${ch.niche}`,
        `- Taal: ${ch.language ?? 'nl'}`,
        `- Target views 10d: ${ch.target_views_10d ?? 280_000}`,
        ch.branding && Object.keys(ch.branding).length > 0 ? `- Branding: ${JSON.stringify(ch.branding)}` : '',
      )
    }
  }

  if (payload.brief) {
    parts.push('### Extra brief van de operator', payload.brief)
  }

  if (parts.length <= 1) {
    parts.push('Geen specifieke context — produceer een algemene viral short brief in een hoog-retention niche (satisfying / cutting / mini-world / marble systems / impossible machines).')
  }

  parts.push('', '## Opdracht', 'Lever exact één content_brief gericht op maximale retention en virality. NIET copy-pasten van het originele kanaal — maak een ORIGINEEL concept dat in dezelfde niche/format zit. Vermijd auteursrechtelijk beschermde content. Eindig met de content_brief tool.')

  return parts.join('\n')
}

async function callForge(task, supabase) {
  if (!ANTHROPIC_API_KEY) throw new Error('ANTHROPIC_API_KEY ontbreekt')
  const anthropic = new Anthropic({ apiKey: ANTHROPIC_API_KEY })
  const system = buildSystemPrompt()
  const userPrompt = await buildUserPrompt(supabase, task.payload ?? {})

  const resp = await anthropic.messages.create({
    model: ANTHROPIC_MODEL,
    max_tokens: 4096,
    system,
    tools: [BRIEF_SCHEMA],
    tool_choice: { type: 'tool', name: 'content_brief' },
    messages: [{ role: 'user', content: userPrompt }],
  })

  await logTask(task.id, 'info', `LLM turn 1 stop_reason=${resp.stop_reason}`, { usage: resp.usage })

  const toolUse = resp.content.find((c) => c.type === 'tool_use' && c.name === 'content_brief')
  if (!toolUse) {
    throw new Error('content_brief tool werd niet aangeroepen door LLM')
  }
  return toolUse.input
}

export async function runContentFactory(task) {
  const supabase = buildClient()
  const payload = task.payload ?? {}

  await logTask(task.id, 'info', 'Forge: brief generation gestart', {
    viral_opportunity_id: payload.viral_opportunity_id ?? null,
    channel_id: payload.channel_id ?? null,
  })

  const brief = await callForge(task, supabase)

  // Insert in media_holding_content_items
  const insert = {
    channel_id: payload.channel_id ?? null,
    source_opportunity_id: payload.viral_opportunity_id ?? null,
    kind: brief.suggested_kind ?? 'short',
    title: brief.titel ?? null,
    prompt: brief.visual_prompt ?? null,
    hook: brief.hook ?? null,
    duration_seconds: brief.duration_target ?? null,
    language: payload.language ?? 'nl',
    status: 'ready', // brief is klaar; render = Phase 2.5
    content_brief: brief,
    scheduled_at: payload.scheduled_at ?? null,
    rendered_at: null,
  }

  const { data: item, error } = await supabase
    .from('media_holding_content_items')
    .insert(insert)
    .select('id, title, kind, status')
    .single()

  if (error) throw new Error(`content_item insert: ${error.message}`)

  await logTask(task.id, 'info', 'Content brief klaar', {
    content_item_id: item.id,
    kind: item.kind,
  })

  // Update worker registry
  await supabase
    .from('media_holding_workers')
    .update({ status: 'idle', last_seen: new Date().toISOString() })
    .eq('name', 'content-renderer-default')

  return {
    ok: true,
    summary: `Forge brief klaar: "${brief.titel}" (kind=${brief.suggested_kind}, ${brief.duration_target}s). content_item_id=${item.id}`,
  }
}

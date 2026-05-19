// Sponsor Engine — Phase 8
//
// Voor een channel (of niche): Anthropic genereert N relevante brands
// met fit_score + email outreach draft. Insert in sponsor_engine_targets.
//
// Task payload: { channel_id?, niche?, n? (default 10), region? (default 'NL') }

import Anthropic from '@anthropic-ai/sdk'
import { createClient } from '@supabase/supabase-js'
import { logTask } from '../logging.js'

const SUPABASE_URL = process.env.ORCHESTRATOR_SUPABASE_URL ?? process.env.SUPABASE_URL
const SUPABASE_KEY = process.env.ORCHESTRATOR_SUPABASE_SERVICE_ROLE_KEY ?? process.env.SUPABASE_SERVICE_ROLE_KEY
const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY
const ANTHROPIC_MODEL = process.env.ANTHROPIC_MODEL ?? 'claude-sonnet-4-6'

const BRAND_SCHEMA = {
  name: 'sponsor_targets',
  description: 'Lijst van relevante brand sponsors voor een YouTube/media kanaal met fit-analyse en outreach drafts.',
  input_schema: {
    type: 'object',
    required: ['targets'],
    properties: {
      targets: {
        type: 'array',
        items: {
          type: 'object',
          required: ['brand_name','industry','fit_score','outreach_draft'],
          properties: {
            brand_name:      { type: 'string', description: 'Naam van het merk' },
            website:         { type: 'string', description: 'Hoofddomein (zonder https), zoals "nike.com"' },
            industry:        { type: 'string', description: 'Branche / sector' },
            category:        { type: 'string', description: 'Subcategorie (bv "athletic apparel", "AI tooling")' },
            fit_score:       { type: 'integer', minimum: 0, maximum: 100, description: '0-100 hoe goed de fit is met kanaal & niche' },
            est_budget:      { type: 'string', description: 'Geschatte sponsorbudget range, bv "€500-2K", "€5K-20K"' },
            contact_name:    { type: 'string', description: 'Indien bekend: hoofd marketing/partnerships (anders typische functie zoals "Brand Partnerships Manager")' },
            contact_email:   { type: 'string', description: 'Indien publiek bekend, anders generic zoals "partnerships@<brand>.com"' },
            outreach_draft:  { type: 'string', description: 'Volledige outreach email draft in NL of EN: subject + body, persoonlijk, gericht op de fit en concrete propositie. 150-250 woorden.' },
            notes:           { type: 'string', description: 'Kort waarom dit een goede fit is (1-2 zinnen)' },
          },
        },
      },
    },
  },
}

function buildClient() {
  if (!SUPABASE_URL || !SUPABASE_KEY) throw new Error('Supabase env vars ontbreken')
  return createClient(SUPABASE_URL, SUPABASE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
}

async function loadChannelContext(supabase, channelId) {
  if (!channelId) return null
  const { data } = await supabase
    .from('media_holding_channels')
    .select('name, niche, language, target_views_10d, branding, status')
    .eq('id', channelId)
    .single()
  return data
}

export async function runSponsorEngine(task) {
  if (!ANTHROPIC_API_KEY) throw new Error('ANTHROPIC_API_KEY ontbreekt')
  const supabase = buildClient()
  const payload = task.payload ?? {}

  const channelId = payload.channel_id ?? null
  const niche     = payload.niche ?? null
  const n         = Math.max(1, Math.min(20, payload.n ?? 10))
  const region    = payload.region ?? 'NL'

  if (!channelId && !niche) {
    throw new Error('Geef channel_id OF niche mee')
  }

  await logTask(task.id, 'info', 'Sponsor Engine gestart', { channelId, niche, n, region })

  const channel = await loadChannelContext(supabase, channelId)
  const effectiveNiche = channel?.niche ?? niche

  const anthropic = new Anthropic({ apiKey: ANTHROPIC_API_KEY })

  const system = [
    'Je bent een sponsorship-strateeg voor een AI Media Holding.',
    'Identificeer relevante BRAND sponsors voor de gegeven channel niche.',
    'Per brand: fit_score (0-100), realistic outreach draft (NL of EN), categorie en geschat budget.',
    'Outreach moet specifiek zijn (niet generic), gericht op de audience en concrete propositie.',
    'Eindig altijd met de sponsor_targets tool.',
  ].join(' ')

  const userPrompt = [
    '## Context',
    channel ? [
      `Kanaal: ${channel.name}`,
      `Niche: ${channel.niche}`,
      `Taal: ${channel.language ?? 'nl'}`,
      `Target views 10d: ${channel.target_views_10d ?? 280_000}`,
      `Status: ${channel.status}`,
    ].join('\n') : `Niche: ${niche}`,
    `Regio: ${region}`,
    '',
    '## Opdracht',
    `Lijst ${n} ECHTE bestaande brands die goed passen bij deze niche en regio. Mix:`,
    '- Direct relevante brands (kern audience fit)',
    '- Aangrenzende brands (cross-pollination)',
    '- Affiliate-vriendelijke brands (commission programmas)',
    '',
    'Geef per brand een SPECIFIEKE outreach email (subject + body), gericht op deze niche en audience. Geen lege placeholders.',
    'Eindig met sponsor_targets tool.',
  ].join('\n')

  const resp = await anthropic.messages.create({
    model: ANTHROPIC_MODEL,
    max_tokens: 8192,
    system,
    tools: [BRAND_SCHEMA],
    tool_choice: { type: 'tool', name: 'sponsor_targets' },
    messages: [{ role: 'user', content: userPrompt }],
  })

  await logTask(task.id, 'info', `LLM turn 1 stop_reason=${resp.stop_reason}`, { usage: resp.usage })

  const toolUse = resp.content.find((c) => c.type === 'tool_use' && c.name === 'sponsor_targets')
  if (!toolUse) throw new Error('sponsor_targets tool werd niet aangeroepen')
  const targets = Array.isArray(toolUse.input?.targets) ? toolUse.input.targets : []
  if (targets.length === 0) throw new Error('LLM gaf 0 targets terug')

  const rows = targets.map((t) => ({
    channel_id:     channelId,
    brand_name:     String(t.brand_name).slice(0, 200),
    website:        t.website ?? null,
    industry:       t.industry ?? null,
    category:       t.category ?? null,
    fit_score:      Math.max(0, Math.min(100, Number(t.fit_score) || 0)),
    est_budget:     t.est_budget ?? null,
    contact_name:   t.contact_name ?? null,
    contact_email:  t.contact_email ?? null,
    outreach_draft: t.outreach_draft ?? null,
    notes:          t.notes ?? null,
    status:         'prospect',
  }))

  const { error, count } = await supabase
    .from('sponsor_engine_targets')
    .insert(rows, { count: 'exact' })

  if (error) throw new Error(`sponsor_engine_targets insert: ${error.message}`)

  return {
    ok: true,
    summary: `Sponsor Engine: ${count ?? rows.length} brands gegenereerd voor ${channel?.name ?? effectiveNiche} (top fit ${Math.max(...rows.map(r => r.fit_score))}, gemiddeld ${Math.round(rows.reduce((a, r) => a + r.fit_score, 0) / rows.length)}).`,
  }
}

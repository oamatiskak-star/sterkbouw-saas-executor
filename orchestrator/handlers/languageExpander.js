// Language Expander — Phase 11
//
// Per source content_item: fan-out naar target_langs. Per target_lang:
//   1. Insert language_expansion_targets row (pending)
//   2. Dispatch content_factory task met language= target_lang +
//      brief tekst met lokalisatie-instructie + language_target_id payload
//   3. Trigger (migratie 062) link't output_content_id terug
//
// Task payload: { source_content_item_id, target_langs?, channel_id? }
//
// Spec talen: en, es, de, fr, pt, ar

import { createClient } from '@supabase/supabase-js'
import { logTask } from '../logging.js'

const SUPABASE_URL = process.env.ORCHESTRATOR_SUPABASE_URL ?? process.env.SUPABASE_URL
const SUPABASE_KEY = process.env.ORCHESTRATOR_SUPABASE_SERVICE_ROLE_KEY ?? process.env.SUPABASE_SERVICE_ROLE_KEY

const DEFAULT_TARGETS = ['en','es','de','fr','pt','ar']

const LANG_NAMES = {
  en: 'English',
  es: 'Spanish',
  de: 'German',
  fr: 'French',
  pt: 'Portuguese',
  ar: 'Arabic',
  nl: 'Dutch',
}

function buildClient() {
  if (!SUPABASE_URL || !SUPABASE_KEY) throw new Error('Supabase env vars ontbreken')
  return createClient(SUPABASE_URL, SUPABASE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
}

function buildLocalizationBrief(lang, sourceItem) {
  const name = LANG_NAMES[lang] ?? lang
  const sourceTitel = sourceItem?.title ?? sourceItem?.content_brief?.titel ?? ''
  const sourceHook  = sourceItem?.hook ?? sourceItem?.content_brief?.hook ?? ''
  const sourceBeschrijving = sourceItem?.content_brief?.beschrijving ?? ''

  return [
    `Lokaliseer dit virale concept volledig naar ${name} (${lang}). Schrijf alle output (titel, hook, beschrijving, hashtags) in ${name}.`,
    '',
    'Bronmateriaal:',
    sourceTitel ? `- Titel: ${sourceTitel}` : null,
    sourceHook ? `- Hook: ${sourceHook}` : null,
    sourceBeschrijving ? `- Beschrijving: ${sourceBeschrijving.slice(0, 300)}` : null,
    '',
    `Niet letterlijk vertalen — pas culturele referenties, idiomen en humor aan voor ${name}-speaking audience.`,
    `Hashtags moeten populair zijn in ${name}-speaking regio's, niet alleen vertaalde versies van originele tags.`,
    `Hook moet werken in ${name} cultuur en taal — geen direct vertaalde Engels-isms.`,
  ].filter(Boolean).join('\n')
}

export async function runLanguageExpander(task) {
  const supabase = buildClient()
  const payload = task.payload ?? {}

  if (!payload.source_content_item_id) {
    throw new Error('source_content_item_id ontbreekt')
  }
  const targetLangs = Array.isArray(payload.target_langs) && payload.target_langs.length > 0
    ? payload.target_langs
    : DEFAULT_TARGETS

  await logTask(task.id, 'info', 'Language Expander gestart', {
    source_content_item_id: payload.source_content_item_id, target_langs: targetLangs,
  })

  // Laad source content item voor context
  const { data: source, error: sourceErr } = await supabase
    .from('media_holding_content_items')
    .select('id, title, hook, content_brief, kind, channel_id')
    .eq('id', payload.source_content_item_id)
    .single()
  if (sourceErr || !source) throw new Error(`source content_item niet gevonden: ${sourceErr?.message ?? 'no row'}`)

  let targetsCreated = 0
  let tasksDispatched = 0
  const skipped = []

  for (const lang of targetLangs) {
    // Dedupe: skip als target al bestaat
    const { data: existing } = await supabase
      .from('language_expansion_targets')
      .select('id, status')
      .eq('content_item_id', source.id)
      .eq('target_lang', lang)
      .maybeSingle()
    if (existing) {
      skipped.push(`${lang} (status: ${existing.status})`)
      continue
    }

    const { data: target, error: targetErr } = await supabase
      .from('language_expansion_targets')
      .insert({
        content_item_id: source.id,
        target_lang: lang,
        status: 'pending',
      })
      .select('id')
      .single()
    if (targetErr) {
      await logTask(task.id, 'warn', `target ${lang} insert fail`, { error: targetErr.message })
      continue
    }
    targetsCreated++

    const briefText = buildLocalizationBrief(lang, source)

    const { error: taskErr } = await supabase.from('orchestrator_tasks').insert({
      company_id: 'modiwerijo',
      title: `Forge ${lang.toUpperCase()} variant — ${source.title?.slice(0, 40) ?? ''}`,
      task_type: 'language_variant',
      executor: 'content_factory',
      allowed_actions: ['*'],
      priority: 4,
      status: 'open',
      objective: [`Genereer ${LANG_NAMES[lang] ?? lang} variant brief voor source content.`],
      payload: {
        channel_id: payload.channel_id ?? source.channel_id ?? null,
        brief: briefText,
        language: lang,
        language_target_id: target.id,
        persona: 'Forge',
        language_expander_task_id: task.id,
      },
    })

    if (taskErr) {
      await logTask(task.id, 'warn', `task dispatch ${lang} fail`, { error: taskErr.message })
      await supabase.from('language_expansion_targets').update({
        status: 'failed',
      }).eq('id', target.id)
      continue
    }

    await supabase.from('language_expansion_targets').update({
      status: 'translating',
    }).eq('id', target.id)

    tasksDispatched++
  }

  return {
    ok: true,
    summary: `Language Expander: ${targetsCreated} targets aangemaakt, ${tasksDispatched} Forge tasks gedispatcht (${targetLangs.length} talen). ${skipped.length > 0 ? `Skipped: ${skipped.join(', ')}` : ''}`.trim(),
  }
}

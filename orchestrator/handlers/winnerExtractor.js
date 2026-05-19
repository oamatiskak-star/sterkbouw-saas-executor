// Winner Extraction — Phase 6
//
// Voor een viral content_item (of viral_opportunity):
//   1. Maak per variant_kind een winner_extraction_jobs row aan (status=pending)
//   2. Dispatch een Forge task per row met:
//      - source_content_id ofwel viral_opportunity_id
//      - brief tekst die het variant-type beschrijft
//      - winner_job_id zodat Forge het in content_brief._winner_job_id stopt
//      - variant_kind
//   3. Trigger (migratie 058) link't output_content_id automatisch terug
//
// Task payload: { source_content_item_id?, source_viral_opportunity_id?,
//                 channel_id?, variant_kinds?: string[], variants_per_kind?: int }
//
// Spec: één viral asset moet 50+ derivatives worden = 10 kinds × 5 = 50

import { createClient } from '@supabase/supabase-js'
import { logTask } from '../logging.js'

const SUPABASE_URL = process.env.ORCHESTRATOR_SUPABASE_URL ?? process.env.SUPABASE_URL
const SUPABASE_KEY = process.env.ORCHESTRATOR_SUPABASE_SERVICE_ROLE_KEY ?? process.env.SUPABASE_SERVICE_ROLE_KEY

const ALL_VARIANT_KINDS = [
  'remix', 'loop', 'compilation', 'slowed', 'enhanced',
  'multilingual', 'stitched', 'extended', 'horizontal', 'reaction_bait',
]

// Brief-prompts per variant_kind. Forge gebruikt deze als sturing.
// Idx wordt toegevoegd bij multi-variants per kind voor variatie.
const VARIANT_BRIEFS = {
  remix:        (i) => `Maak een ORIGINELE remix (#${i + 1}/N) van dit viral concept: zelfde emotionele kern, totaal andere visuele uitwerking (andere setting, kleurpalet, pacing). Geen copy-paste. Mik op een unieke visual style die het thema versterkt.`,
  loop:         (i) => `Maak een SEAMLESS LOOP variant (#${i + 1}/N): 5-10 seconden visueel die perfect terugloopt. Beeld eindigt precies op startframe. Hoog satisfying-gehalte. Varieer pacing en kleurpalet.`,
  compilation:  (i) => `Maak een COMPILATION-stijl variant (#${i + 1}/N): 3-5 micro-momenten van dit concept achter elkaar met snijdende pacing. Elke micro 2-3 sec. Tempo crescendo.`,
  slowed:       (i) => `Maak een SLOW-MOTION cinematic variant (#${i + 1}/N): 0.25x tempo van de kern-shot, dramatische muziek, lange holds, extreme close-ups.`,
  enhanced:     (i) => `Maak een AI-ENHANCED versie (#${i + 1}/N): zelfde concept maar met 4K crisp upgrade, gecorrigeerd kleurgrade, toegevoegde particle effects, en cinematisch lens flares.`,
  multilingual: (i) => `Maak een MULTI-LINGUAL variant (#${i + 1}/N) in het Engels gericht op global audience: zelfde concept, andere taalcode + culturele context aanpassingen, voice-over indien van toepassing.`,
  stitched:     (i) => `Maak een STITCHED reaction variant (#${i + 1}/N): het origineel als achtergrond linker helft, een talking-head/picture-in-picture in de rechter onder hoek die kort reageert met text overlay.`,
  extended:     (i) => `Maak een EXTENDED variant (#${i + 1}/N): vertel hetzelfde verhaal in 30-45 seconden in plaats van de korte versie. Voeg setup, climax en payoff toe.`,
  horizontal:   (i) => `Maak een HORIZONTAL (16:9) variant (#${i + 1}/N) van dit concept geoptimaliseerd voor YouTube long-form: bredere shots, traagere pacing, meer ruimte voor B-roll.`,
  reaction_bait:(i) => `Maak een REACTION BAIT variant (#${i + 1}/N): voeg een schokkende cliffhanger of impossible-looking moment toe in de eerste 3 seconden dat letterlijk "Wait what?" vraagt aan de kijker.`,
}

function buildClient() {
  if (!SUPABASE_URL || !SUPABASE_KEY) throw new Error('Supabase env vars ontbreken')
  return createClient(SUPABASE_URL, SUPABASE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
}

export async function runWinnerExtractor(task) {
  const supabase = buildClient()
  const payload = task.payload ?? {}

  const sourceContentId = payload.source_content_item_id ?? null
  const sourceOppId     = payload.source_viral_opportunity_id ?? null
  if (!sourceContentId && !sourceOppId) {
    throw new Error('source_content_item_id OF source_viral_opportunity_id vereist')
  }

  const variantKinds = Array.isArray(payload.variant_kinds) && payload.variant_kinds.length > 0
    ? payload.variant_kinds.filter((k) => ALL_VARIANT_KINDS.includes(k))
    : ALL_VARIANT_KINDS

  const perKind = Math.max(1, Math.min(10, payload.variants_per_kind ?? 1))
  const total = variantKinds.length * perKind

  await logTask(task.id, 'info', 'Winner Extractor gestart', {
    sourceContentId, sourceOppId, variantKinds, perKind, total,
  })

  let jobsCreated = 0
  let tasksDispatched = 0

  for (const kind of variantKinds) {
    for (let i = 0; i < perKind; i++) {
      // Eerst de winner_extraction_jobs row maken (source_content_id is verplicht
      // in schema). Bij viral_opportunity bron: skip de job (geen content_id), dispatch
      // alleen Forge task.
      let jobId = null
      if (sourceContentId) {
        const { data: job, error: jobErr } = await supabase
          .from('winner_extraction_jobs')
          .insert({
            source_content_id: sourceContentId,
            variant_kind: kind,
            status: 'pending',
            notes: `Fan-out #${i + 1}/${perKind} van type ${kind} via Winner Extractor`,
          })
          .select('id')
          .single()
        if (jobErr) {
          await logTask(task.id, 'warn', `winner_extraction_jobs insert ${kind} #${i}`, { error: jobErr.message })
          continue
        }
        jobId = job.id
        jobsCreated++
      }

      const briefText = (VARIANT_BRIEFS[kind] ?? VARIANT_BRIEFS.remix)(i)

      const { data: child, error: taskErr } = await supabase
        .from('orchestrator_tasks')
        .insert({
          company_id: 'modiwerijo',
          title: `Forge variant ${kind} (#${i + 1}/${perKind})`,
          task_type: 'winner_variant',
          executor: 'content_factory',
          allowed_actions: ['*'],
          priority: 4,
          status: 'open',
          objective: [`Maak ${kind} variant brief voor winner extraction.`],
          payload: {
            viral_opportunity_id: sourceOppId,
            channel_id: payload.channel_id ?? null,
            brief: briefText,
            persona: 'Forge',
            variant_kind: kind,
            winner_job_id: jobId,
            winner_parent_task_id: task.id,
          },
        })
        .select('id')
        .single()

      if (taskErr) {
        await logTask(task.id, 'warn', `task dispatch ${kind} #${i}`, { error: taskErr.message })
        if (jobId) {
          await supabase.from('winner_extraction_jobs').update({
            status: 'failed',
            notes: `dispatch fail: ${taskErr.message?.slice(0, 200)}`,
          }).eq('id', jobId)
        }
        continue
      }

      // Optional: mark winner job 'rendering' direct (dispatcht naar Forge)
      if (jobId) {
        await supabase.from('winner_extraction_jobs').update({
          status: 'rendering',
        }).eq('id', jobId)
      }

      tasksDispatched++
    }
  }

  return {
    ok: true,
    summary: `Winner Extractor: ${jobsCreated} jobs aangemaakt, ${tasksDispatched} Forge tasks gedispatcht (${variantKinds.length} kinds × ${perKind} per kind = ${total} variants).`,
  }
}

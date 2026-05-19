// Algorithm Gravity Engine — Phase 3
//
// Scant viral_opportunities op breakouts (velocity-delta tussen snapshots).
// Per breakout:
//   1. Log algorithm_gravity_events row (event_type = 'breakout', magnitude = delta_pct, notes met viral_opportunity_id)
//   2. Spawn 5x winner_extraction_jobs (remix/loop/compilation/slowed/multilingual)
//   3. Dispatch 5x orchestrator_tasks met executor='content_factory' (persona=Forge) zodat
//      Forge briefs maakt voor elke variant.
//
// Worker name: 'gravity-detector' in media_holding_workers.

import { createClient } from '@supabase/supabase-js'
import { logTask } from '../logging.js'

const SUPABASE_URL = process.env.ORCHESTRATOR_SUPABASE_URL ?? process.env.SUPABASE_URL
const SUPABASE_KEY = process.env.ORCHESTRATOR_SUPABASE_SERVICE_ROLE_KEY ?? process.env.SUPABASE_SERVICE_ROLE_KEY

const VARIANT_KINDS = ['remix', 'loop', 'compilation', 'slowed', 'multilingual']
// Brief prefix templates per variant
const VARIANT_BRIEFS = {
  remix:        'Maak een ORIGINELE remix van dit virale concept: zelfde emotionele kern, totaal andere visuele uitwerking (andere setting, kleurpalet, pacing). Geen copy-paste.',
  loop:         'Maak een SEAMLESS LOOP variant: 5-10 seconden visueel die perfect terugloopt. Beeld eindigt precies op startframe. Hoog satisfying-gehalte.',
  compilation:  'Maak een COMPILATION-stijl variant: 3-5 micro-momenten van dit concept achter elkaar met snijdende pacing. Elke micro 2-3 sec.',
  slowed:       'Maak een SLOW-MOTION cinematic variant: 0.25x tempo van de kern-shot, dramatische muziek, lange holds, extreme close-ups.',
  multilingual: 'Maak een MULTI-LINGUAL variant in het Engels gericht op global audience: zelfde concept, andere taalcode + culturele context aanpassingen.',
}

function buildClient() {
  if (!SUPABASE_URL || !SUPABASE_KEY) throw new Error('Supabase env vars ontbreken')
  return createClient(SUPABASE_URL, SUPABASE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
}

async function checkBreakout(supabase, oppId) {
  const { data, error } = await supabase.rpc('detect_viral_breakout', { p_viral_opportunity_id: oppId })
  if (error) throw new Error(`detect_viral_breakout RPC: ${error.message}`)
  return Array.isArray(data) && data[0] ? data[0] : null
}

async function alreadyHasBreakoutEvent(supabase, oppId) {
  // Voorkomt dat dezelfde breakout meerdere keren wordt geregistreerd.
  // We checken op de meest recente algorithm_gravity_event voor dit opportunity:
  // als die jonger is dan 1 uur, slaan we deze run over voor dat opp.
  const { data, error } = await supabase
    .from('algorithm_gravity_events')
    .select('id, detected_at')
    .eq('event_type', 'breakout')
    .like('notes', `%viral_opportunity_id=${oppId}%`)
    .order('detected_at', { ascending: false })
    .limit(1)
  if (error || !data || data.length === 0) return false
  const ageMs = Date.now() - new Date(data[0].detected_at).getTime()
  return ageMs < 60 * 60 * 1000 // 1 uur
}

async function spawnVariantsForBreakout(supabase, opp, taskId) {
  // Vind of maak een content_item dat als "source_content" dient voor winner_extraction_jobs.
  // Voor externe (viral_opportunities) bronnen hebben we geen lokaal content_item; we
  // skippen winner_extraction_jobs en spawn'en alleen Forge brief tasks.
  const dispatched = []

  for (const kind of VARIANT_KINDS) {
    const briefText = VARIANT_BRIEFS[kind]
    const { data: task, error } = await supabase
      .from('orchestrator_tasks')
      .insert({
        company_id: 'modiwerijo',
        title: `Variant '${kind}' van breakout: ${opp.title?.slice(0, 60) ?? '—'}`,
        task_type: 'gravity_variant',
        executor: 'content_factory',
        allowed_actions: ['*'],
        priority: 4,
        status: 'open',
        objective: [`Genereer een ${kind} variant brief voor breakout viral kans.`],
        payload: {
          viral_opportunity_id: opp.id,
          brief: briefText,
          persona: 'Forge',
          variant_kind: kind,
          gravity_parent_task_id: taskId,
        },
      })
      .select('id')
      .single()

    if (!error && task) dispatched.push({ kind, task_id: task.id })
  }

  return dispatched
}

async function logGravityEvent(supabase, opp, breakout, dispatched, taskId) {
  const { error } = await supabase.from('algorithm_gravity_events').insert({
    event_type: 'breakout',
    magnitude: Math.round(Math.min(9999, Math.max(-9999, Number(breakout.velocity_delta_pct ?? 0)))),
    notes: [
      `viral_opportunity_id=${opp.id}`,
      `platform=${opp.source_platform}`,
      `external_id=${opp.external_id}`,
      `velocity_now=${Math.round(Number(breakout.current_velocity ?? 0))}/u`,
      `velocity_prev=${Math.round(Number(breakout.previous_velocity ?? 0))}/u`,
      `delta_pct=${Number(breakout.velocity_delta_pct ?? 0).toFixed(1)}`,
      `variants_dispatched=${dispatched.length}`,
      `gravity_task=${taskId}`,
    ].join('; '),
  })
  if (error) throw new Error(`algorithm_gravity_events insert: ${error.message}`)
}

export async function runGravityDetector(task) {
  const supabase = buildClient()
  await logTask(task.id, 'info', 'Gravity Detector gestart')

  await supabase.from('media_holding_workers').update({
    status: 'running', last_seen: new Date().toISOString(), last_error: null,
  }).eq('name', 'gravity-detector')

  try {
    // Kandidaten: alle viral_opportunities met >= 2 snapshots, captured in last 24h
    const { data: candidates, error } = await supabase
      .from('viral_opportunities')
      .select('id, title, source_platform, external_id, channel_name')
      .gte('captured_at', new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString())
      .limit(500)

    if (error) throw new Error(`candidates query: ${error.message}`)

    let checked = 0
    let breakoutsDetected = 0
    let variantsDispatched = 0
    const breakoutList = []

    for (const opp of candidates ?? []) {
      checked++
      const breakout = await checkBreakout(supabase, opp.id)
      if (!breakout || !breakout.is_breakout) continue

      // Dedupe: skip als reeds geregistreerd in laatste uur
      if (await alreadyHasBreakoutEvent(supabase, opp.id)) continue

      const dispatched = await spawnVariantsForBreakout(supabase, opp, task.id)
      await logGravityEvent(supabase, opp, breakout, dispatched, task.id)

      breakoutsDetected++
      variantsDispatched += dispatched.length
      breakoutList.push({
        title: opp.title?.slice(0, 80),
        delta_pct: Number(breakout.velocity_delta_pct).toFixed(1),
        variants: dispatched.length,
      })

      if (breakoutsDetected >= 10) break // safety cap per run
    }

    await supabase.from('media_holding_workers').update({
      status: 'idle', last_seen: new Date().toISOString(),
    }).eq('name', 'gravity-detector')

    await logTask(task.id, 'info', 'Gravity Detector klaar', {
      checked, breakoutsDetected, variantsDispatched,
    })

    return {
      ok: true,
      summary: `Gravity scan: ${checked} kandidaten gecheckt, ${breakoutsDetected} breakouts, ${variantsDispatched} Forge variants dispatched.${breakoutList.length ? ' ' + breakoutList.map(b => `[${b.delta_pct}% '${b.title}']`).join(' ') : ''}`,
    }
  } catch (e) {
    await supabase.from('media_holding_workers').update({
      status: 'error', last_error: e.message?.slice(0, 1000), last_seen: new Date().toISOString(),
    }).eq('name', 'gravity-detector')
    throw e
  }
}

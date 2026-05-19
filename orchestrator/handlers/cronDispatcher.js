// Cron Dispatcher — Phase 12
//
// Periodieke handler die op-demand of via een schedule wordt aangeroepen.
// Hij dispatcht standaard-scans (viral_scanner / trend_scanner / audio_scanner)
// als er geen recente identieke open task bestaat.
//
// Task payload (optioneel): { tasks?: string[] }
//   tasks = ['viral_scanner','trend_scanner','audio_scanner'] (default = all)
//
// Dedupe: per executor checkt hij of er een open of in_progress task is met
// dezelfde executor; zo ja, skip.

import { createClient } from '@supabase/supabase-js'
import { logTask } from '../logging.js'

const SUPABASE_URL = process.env.ORCHESTRATOR_SUPABASE_URL ?? process.env.SUPABASE_URL
const SUPABASE_KEY = process.env.ORCHESTRATOR_SUPABASE_SERVICE_ROLE_KEY ?? process.env.SUPABASE_SERVICE_ROLE_KEY

const DEFAULT_SCANS = [
  { executor: 'viral_scanner', title: '[cron] viral scan',  task_type: 'viral_scan',  payload: { regions: ['NL','US','GB'] } },
  { executor: 'trend_scanner', title: '[cron] trend scan',  task_type: 'trend_scan',  payload: {} },
  { executor: 'audio_scanner', title: '[cron] audio scan',  task_type: 'audio_scan',  payload: {} },
]

function buildClient() {
  if (!SUPABASE_URL || !SUPABASE_KEY) throw new Error('Supabase env vars ontbreken')
  return createClient(SUPABASE_URL, SUPABASE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
}

export async function runCronDispatcher(task) {
  const supabase = buildClient()
  const payload = task.payload ?? {}
  const wanted = Array.isArray(payload.tasks) && payload.tasks.length > 0
    ? payload.tasks
    : DEFAULT_SCANS.map((s) => s.executor)

  await logTask(task.id, 'info', 'Cron Dispatcher gestart', { wanted })

  let dispatched = 0
  const skipped = []

  for (const scan of DEFAULT_SCANS) {
    if (!wanted.includes(scan.executor)) continue

    // Dedupe: skip als er al een open/in_progress task is voor deze executor
    const { count } = await supabase
      .from('orchestrator_tasks')
      .select('id', { count: 'exact', head: true })
      .eq('executor', scan.executor)
      .in('status', ['open', 'in_progress'])
    if ((count ?? 0) > 0) {
      skipped.push(`${scan.executor} (${count} open)`)
      continue
    }

    // Skip als laatste run < 30 minuten geleden was
    const { data: recent } = await supabase
      .from('orchestrator_tasks')
      .select('id, created_at')
      .eq('executor', scan.executor)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()
    if (recent && new Date(recent.created_at).getTime() > Date.now() - 30 * 60 * 1000) {
      skipped.push(`${scan.executor} (recent <30m)`)
      continue
    }

    const { error } = await supabase.from('orchestrator_tasks').insert({
      company_id: 'modiwerijo',
      title: scan.title,
      task_type: scan.task_type,
      executor: scan.executor,
      allowed_actions: ['*'],
      priority: 5,
      status: 'open',
      objective: [`Periodieke ${scan.executor} scan.`],
      payload: { ...scan.payload, cron_dispatcher_task_id: task.id },
    })
    if (error) {
      await logTask(task.id, 'warn', `dispatch ${scan.executor} fail`, { error: error.message })
      continue
    }
    dispatched++
  }

  return {
    ok: true,
    summary: `Cron Dispatcher: ${dispatched} scans gedispatcht. ${skipped.length > 0 ? `Skipped: ${skipped.join(', ')}` : ''}`.trim(),
  }
}

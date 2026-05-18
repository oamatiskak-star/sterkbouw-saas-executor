// Interrupt-check: vóór elke nieuwe claim() kijken of er een Hoog-task
// wacht die een lopende Normaal/Laag mag onderbreken.
//
// In de huidige F2 single-concurrency setup voert dezelfde worker maar
// één taak tegelijk uit. Als die taak `interruptible=true` is en er een
// nieuwe Hoog-task arriveert, zal de worker bij de volgende dispatcher-tick
// kunnen onderbreken. We doen dat coöperatief: handlers checken
// shouldInterrupt() op rust-punten.

import { supabase } from './state.js'
import { logTask } from './logging.js'

export async function pendingHighPriorityCount() {
  if (!supabase) return 0
  const { count, error } = await supabase
    .from('orchestrator_tasks')
    .select('id', { count: 'exact', head: true })
    .eq('priority_band', 'hoog')
    .in('status', ['open', 'retry'])
  if (error) return 0
  return count ?? 0
}

export function isInterruptible(task) {
  return Boolean(task?.interruptible) && !task?.system_critical
}

export async function pauseForInterrupt(task, pausedState = {}) {
  if (!supabase) return
  await logTask(task.id, 'warn', 'Onderbroken door Hoog-prio task', pausedState)
  await supabase
    .from('orchestrator_tasks')
    .update({
      status:       'paused',
      paused_state: { ...pausedState, _reason: 'interrupted_by_hoog' },
    })
    .eq('id', task.id)
}

/**
 * Coöperatieve check voor handlers: roep dit aan op een rustpunt.
 * Returnt true als de handler zou moeten pauzeren ten gunste van een
 * Hoog-prio task. De caller verantwoordelijk voor `pauseForInterrupt`.
 */
export async function shouldInterrupt(task) {
  if (!isInterruptible(task)) return false
  if (task.priority_band === 'hoog') return false
  const n = await pendingHighPriorityCount()
  return n > 0
}

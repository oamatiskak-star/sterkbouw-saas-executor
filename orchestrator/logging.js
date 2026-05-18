// Append-only writers naar orchestrator_task_logs / orchestrator_task_errors / orchestrator_events.
// Faalt nooit hard — logging mag de hoofdtaak niet breken.

import { supabase, WORKER_ID } from './state.js'

const LEVELS = new Set(['debug', 'info', 'warn', 'error'])

function safeMsg(x) {
  if (x == null) return ''
  if (typeof x === 'string') return x
  try { return JSON.stringify(x) } catch { return String(x) }
}

export async function logTask(taskId, level, message, payload = {}) {
  if (!supabase || !taskId) return
  const lvl = LEVELS.has(level) ? level : 'info'
  try {
    await supabase.from('orchestrator_task_logs').insert({
      task_id: taskId,
      level:   lvl,
      message: safeMsg(message),
      payload,
    })
  } catch (e) {
    console.error(`[orchestrator] log insert failed: ${e?.message ?? e}`)
  }
}

export async function logError(taskId, err, { recovered = false } = {}) {
  if (!supabase || !taskId) return
  const message = err instanceof Error ? err.message : safeMsg(err)
  const stack   = err instanceof Error ? err.stack    : null
  const errorClass = err?.constructor?.name ?? 'Error'
  try {
    await supabase.from('orchestrator_task_errors').insert({
      task_id:            taskId,
      error_class:        errorClass,
      message,
      stack_trace:        stack,
      recovery_attempted: false,
      recovered,
    })
  } catch (e) {
    console.error(`[orchestrator] error insert failed: ${e?.message ?? e}`)
  }
}

export async function emitEvent(type, payload = {}, { severity = 'info', taskId = null } = {}) {
  if (!supabase) return
  try {
    await supabase.from('orchestrator_events').insert({
      type,
      severity,
      task_id:   taskId,
      worker_id: WORKER_ID,
      payload,
    })
  } catch (e) {
    console.error(`[orchestrator] event insert failed: ${e?.message ?? e}`)
  }
}

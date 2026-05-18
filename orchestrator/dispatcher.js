// Dispatcher: vangt resultaat/fout van een handler op en update DB.
// Markeert taak completed / failed / retry / blijft 'waiting' bij escalation.

import { supabase, TASK_TIMEOUT_MS } from './state.js'
import { selectHandler } from './handlers/index.js'
import { WaitingForHumanInput } from './escalation.js'
import { logTask, logError } from './logging.js'

async function setCompleted(taskId, summary) {
  await supabase.from('orchestrator_tasks').update({
    status:      'completed',
    finished_at: new Date().toISOString(),
    paused_state: null,
    error:       null,
  }).eq('id', taskId)
  await logTask(taskId, 'info', 'Task completed', { summary: summary?.slice?.(0, 500) })
}

async function setFailedOrRetry(task, err) {
  const willRetry = task.attempts < task.max_attempts
  const status = willRetry ? 'retry' : 'failed'
  const runAt = willRetry
    ? new Date(Date.now() + Math.min(60_000, 5_000 * task.attempts)).toISOString()
    : new Date().toISOString()

  await supabase.from('orchestrator_tasks').update({
    status,
    run_at:       runAt,
    finished_at:  willRetry ? null : new Date().toISOString(),
    error:        err.message?.slice(0, 1000) ?? String(err),
  }).eq('id', task.id)

  await logError(task.id, err)
  await logTask(task.id, willRetry ? 'warn' : 'error', `Handler faalde → ${status}`, {
    attempts: task.attempts,
    max:      task.max_attempts,
  })
}

export async function dispatch(task) {
  if (!supabase) throw new Error('dispatcher: supabase niet geconfigureerd')

  await logTask(task.id, 'info', `Dispatch via ${task.executor}`, {
    band:     task.priority_band,
    attempts: task.attempts,
  })

  let handler
  try {
    handler = selectHandler(task)
  } catch (e) {
    await setFailedOrRetry(task, e)
    return
  }

  try {
    const result = await Promise.race([
      handler(task),
      new Promise((_, r) =>
        setTimeout(() => r(new Error('task timeout')), TASK_TIMEOUT_MS),
      ),
    ])
    await setCompleted(task.id, result?.summary ?? '')
  } catch (err) {
    if (err instanceof WaitingForHumanInput) {
      // Status is al 'waiting' gezet door escalation.ask().
      await logTask(task.id, 'info', 'Task in wachtstand (escalation)')
      return
    }
    await setFailedOrRetry(task, err)
  }
}

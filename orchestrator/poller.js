// Poller: claimt taken via RPC orchestrator_task_claim en dispatcht ze.
// Single-flight per worker (MAX_CONCURRENCY=1 in F2). Hoog-prio krijgt
// voorrang doordat de RPC ordering doet op priority ASC.

import {
  supabase,
  WORKER_ID,
  POLL_INTERVAL_MS,
  MAX_CONCURRENCY,
  isOrchestratorEnabled,
} from './state.js'
import { dispatch } from './dispatcher.js'
import { setWorkerStatus } from './heartbeat.js'
import { logTask, emitEvent } from './logging.js'

let timer = null
let inFlight = 0
let stopped = false

async function claimOne() {
  const { data, error } = await supabase.rpc('orchestrator_task_claim', {
    p_worker_id: WORKER_ID,
    p_max:       1,
  })
  if (error) {
    emitEvent('claim_error', { message: error.message }, { severity: 'error' })
    return null
  }
  return Array.isArray(data) && data.length > 0 ? data[0] : null
}

async function tick() {
  if (stopped) return
  if (!isOrchestratorEnabled()) return
  if (inFlight >= MAX_CONCURRENCY) return

  let task = null
  try {
    task = await claimOne()
  } catch (e) {
    emitEvent('claim_exception', { message: e?.message ?? String(e) }, { severity: 'error' })
    return
  }
  if (!task) return

  inFlight++
  setWorkerStatus('busy', task.id)
  try {
    await logTask(task.id, 'info', `Geclaimd door ${WORKER_ID}`, {
      priority_band: task.priority_band,
    })
    await dispatch(task)
  } finally {
    inFlight--
    setWorkerStatus(inFlight > 0 ? 'busy' : 'idle', null)
  }
}

async function loop() {
  if (stopped) return
  try {
    await tick()
  } catch (e) {
    emitEvent('poller_exception', { message: e?.message ?? String(e) }, { severity: 'error' })
  } finally {
    timer = setTimeout(loop, POLL_INTERVAL_MS)
    timer.unref?.()
  }
}

export function startPoller() {
  if (timer) return
  console.log(`[orchestrator] poller start (worker=${WORKER_ID}, interval=${POLL_INTERVAL_MS}ms)`)
  loop()
}

export function stopPoller() {
  stopped = true
  if (timer) clearTimeout(timer)
  timer = null
}

// Orchestrator entrypoint — wordt vanuit ao.js aangeroepen.
// Activeert zichzelf alleen als ORCHESTRATOR_ENABLED=true en supabase config aanwezig.

import { isOrchestratorEnabled, WORKER_ID } from './state.js'
import { startHeartbeat, markOffline } from './heartbeat.js'
import { startPoller, stopPoller } from './poller.js'
import { emitEvent } from './logging.js'

let started = false

export function startOrchestrator() {
  if (started) return
  if (!isOrchestratorEnabled()) {
    console.log('[orchestrator] uitgeschakeld (ORCHESTRATOR_ENABLED != true)')
    return
  }
  started = true

  console.log(`[orchestrator] starten als worker=${WORKER_ID}`)
  startHeartbeat()
  startPoller()
  emitEvent('worker_started', { worker_id: WORKER_ID }, { severity: 'info' })

  const shutdown = async (signal) => {
    console.log(`[orchestrator] shutdown via ${signal}`)
    stopPoller()
    await markOffline()
    await emitEvent('worker_stopped', { worker_id: WORKER_ID, signal }, { severity: 'info' })
  }

  process.on('SIGTERM', () => shutdown('SIGTERM'))
  process.on('SIGINT',  () => shutdown('SIGINT'))
}

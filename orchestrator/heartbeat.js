// Upsert orchestrator_workers row elke HEARTBEAT_INTERVAL_MS.
// Bevat: status, current_task_id, cpu/ram approx, hostname, meta.

import os from 'node:os'
import { supabase, WORKER_ID, HOSTNAME, HEARTBEAT_INTERVAL_MS } from './state.js'

let timer = null
let currentTaskId = null
let currentStatus = 'idle'

export function setWorkerStatus(status, taskId = null) {
  currentStatus = status
  currentTaskId = taskId
}

async function sendHeartbeat() {
  if (!supabase) return
  const mem = process.memoryUsage()
  const load = os.loadavg()[0] // 1-min load average
  const cpus = os.cpus().length || 1
  const cpuPct = Math.min(100, Math.round((load / cpus) * 100))

  try {
    await supabase.from('orchestrator_workers').upsert({
      worker_id:        WORKER_ID,
      hostname:         HOSTNAME,
      last_seen:        new Date().toISOString(),
      status:           currentStatus,
      current_task_id:  currentTaskId,
      cpu_pct:          cpuPct,
      ram_mb:           Math.round(mem.rss / 1024 / 1024),
      meta: {
        node:    process.version,
        pid:     process.pid,
        uptime:  Math.round(process.uptime()),
        cpus,
      },
    }, { onConflict: 'worker_id' })
  } catch (e) {
    console.error(`[orchestrator/heartbeat] ${e?.message ?? e}`)
  }
}

export function startHeartbeat() {
  if (timer) return
  sendHeartbeat()
  timer = setInterval(sendHeartbeat, HEARTBEAT_INTERVAL_MS)
  timer.unref?.()
}

export async function markOffline() {
  if (timer) clearInterval(timer)
  timer = null
  if (!supabase) return
  try {
    await supabase.from('orchestrator_workers').upsert({
      worker_id: WORKER_ID,
      hostname:  HOSTNAME,
      last_seen: new Date().toISOString(),
      status:    'offline',
      current_task_id: null,
    }, { onConflict: 'worker_id' })
  } catch {}
}

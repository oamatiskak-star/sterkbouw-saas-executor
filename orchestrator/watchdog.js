// Watchdog: periodieke gezondheidschecks.
//
// Elke WATCHDOG_INTERVAL_MS:
//   1. Stuck running tasks (started_at te lang geleden voor hun estimated_runtime)
//      → orchestrator_events 'stuck_task' + reset naar retry (binnen max_attempts)
//   2. Crashed workers (last_seen > WORKER_TIMEOUT_S)
//      → markeer 'offline' + reset hun running tasks naar retry, hun current_task losmaken
//   3. RSS-leak van het eigen process (drempel uit memory key 'watchdog.rss_max_mb')
//      → event 'memory_leak' + (optioneel) restart via SIGTERM
//   4. Failure spike per task_type (>= 5 fouten in 10 min)
//      → event 'failure_spike' per task_type
//   5. Broken routes uit memory key 'watchdog.routes' (lijst van URLs)
//      → HEAD-check, event 'broken_route' bij non-2xx/3xx
//
// Geen mock data — events bevatten echte payloads.

import { supabase, WORKER_ID } from './state.js'
import { emitEvent } from './logging.js'

const WATCHDOG_INTERVAL_MS = parseInt(
  process.env.ORCHESTRATOR_WATCHDOG_INTERVAL_MS ?? '30000', 10
)
const WORKER_TIMEOUT_S = parseInt(
  process.env.ORCHESTRATOR_WORKER_TIMEOUT_S ?? '60', 10
)

const RUNTIME_BUDGET_MS = {
  fast:   60_000,        // 1 min
  medium: 300_000,       // 5 min
  long:   1_800_000,     // 30 min
}

let timer = null
let stopped = false

async function readMemory(key) {
  if (!supabase) return null
  const { data } = await supabase
    .from('orchestrator_memory')
    .select('value')
    .eq('scope', 'global')
    .eq('key', key)
    .maybeSingle()
  return data?.value ?? null
}

// ─── 1. Stuck tasks ──────────────────────────────────────────────────────────
async function checkStuckTasks() {
  if (!supabase) return
  const { data, error } = await supabase
    .from('orchestrator_tasks')
    .select('id, title, estimated_runtime, started_at, attempts, max_attempts, worker_id, system_critical')
    .eq('status', 'running')
    .not('started_at', 'is', null)
  if (error || !data) return

  const now = Date.now()
  for (const t of data) {
    const budget = (RUNTIME_BUDGET_MS[t.estimated_runtime] ?? RUNTIME_BUDGET_MS.medium) * 2
    const age = now - new Date(t.started_at).getTime()
    if (age <= budget) continue

    await emitEvent('stuck_task',
      {
        task_id:           t.id,
        title:             t.title,
        estimated_runtime: t.estimated_runtime,
        age_ms:            age,
        budget_ms:         budget,
        worker_id:         t.worker_id,
      },
      { severity: t.system_critical ? 'critical' : 'warn', taskId: t.id },
    )

    // Reset binnen max_attempts; anders failed.
    const willRetry = t.attempts < t.max_attempts
    await supabase
      .from('orchestrator_tasks')
      .update({
        status:      willRetry ? 'retry' : 'failed',
        worker_id:   null,
        started_at:  null,
        finished_at: willRetry ? null : new Date().toISOString(),
        error:       `watchdog: stuck > ${Math.round(budget / 1000)}s`,
        run_at:      willRetry ? new Date(now + 5_000).toISOString() : new Date().toISOString(),
      })
      .eq('id', t.id)
      .eq('status', 'running')
  }
}

// ─── 2. Crashed workers ──────────────────────────────────────────────────────
async function checkCrashedWorkers() {
  if (!supabase) return
  const cutoff = new Date(Date.now() - WORKER_TIMEOUT_S * 1000).toISOString()
  const { data, error } = await supabase
    .from('orchestrator_workers')
    .select('worker_id, last_seen, status, current_task_id')
    .lt('last_seen', cutoff)
    .neq('status', 'offline')
  if (error || !data) return

  for (const w of data) {
    if (w.worker_id === WORKER_ID) continue // niet onszelf killen

    await emitEvent('crashed_worker',
      {
        worker_id: w.worker_id,
        last_seen: w.last_seen,
        prev_status: w.status,
        current_task_id: w.current_task_id,
      },
      { severity: 'error' },
    )

    await supabase
      .from('orchestrator_workers')
      .update({ status: 'offline', current_task_id: null })
      .eq('worker_id', w.worker_id)

    // Reset hun running tasks
    const { data: tasks } = await supabase
      .from('orchestrator_tasks')
      .select('id, attempts, max_attempts')
      .eq('worker_id', w.worker_id)
      .eq('status', 'running')

    for (const t of tasks ?? []) {
      const willRetry = t.attempts < t.max_attempts
      await supabase
        .from('orchestrator_tasks')
        .update({
          status:     willRetry ? 'retry' : 'failed',
          worker_id:  null,
          started_at: null,
          run_at:     new Date().toISOString(),
          error:      'watchdog: worker offline',
        })
        .eq('id', t.id)
    }
  }
}

// ─── 3. RSS-leak ─────────────────────────────────────────────────────────────
async function checkMemoryLeak() {
  const max = await readMemory('watchdog.rss_max_mb')
  if (typeof max !== 'number' || max <= 0) return

  const rssMb = process.memoryUsage().rss / 1024 / 1024
  if (rssMb <= max) return

  await emitEvent('memory_leak',
    { worker_id: WORKER_ID, rss_mb: Math.round(rssMb), threshold_mb: max },
    { severity: 'warn' },
  )

  // Auto-restart als watchdog.rss_auto_restart === true
  const autoRestart = await readMemory('watchdog.rss_auto_restart')
  if (autoRestart === true) {
    console.warn(`[watchdog] RSS ${Math.round(rssMb)}MB > ${max}MB — SIGTERM zelf`)
    process.kill(process.pid, 'SIGTERM')
  }
}

// ─── 4. Failure spike per task_type ──────────────────────────────────────────
async function checkFailureSpike() {
  if (!supabase) return
  const since = new Date(Date.now() - 10 * 60 * 1000).toISOString()
  const { data, error } = await supabase
    .from('orchestrator_tasks')
    .select('task_type')
    .eq('status', 'failed')
    .gte('finished_at', since)
  if (error || !data) return

  const counts = new Map()
  for (const r of data) {
    const k = r.task_type ?? '(geen)'
    counts.set(k, (counts.get(k) ?? 0) + 1)
  }

  for (const [type, n] of counts) {
    if (n < 5) continue
    await emitEvent('failure_spike',
      { task_type: type, failures_10min: n },
      { severity: 'error' },
    )
  }
}

// ─── 5. Broken routes ────────────────────────────────────────────────────────
async function checkRoutes() {
  const routes = await readMemory('watchdog.routes')
  if (!Array.isArray(routes) || routes.length === 0) return

  for (const url of routes) {
    if (typeof url !== 'string' || !/^https?:\/\//.test(url)) continue
    try {
      const ctrl = new AbortController()
      const timer = setTimeout(() => ctrl.abort(), 8_000)
      const res = await fetch(url, { method: 'HEAD', signal: ctrl.signal })
      clearTimeout(timer)
      if (res.status >= 400) {
        await emitEvent('broken_route',
          { url, status: res.status },
          { severity: res.status >= 500 ? 'error' : 'warn' },
        )
      }
    } catch (e) {
      await emitEvent('broken_route',
        { url, error: e?.message ?? String(e) },
        { severity: 'error' },
      )
    }
  }
}

// ─── tick ────────────────────────────────────────────────────────────────────
async function tick() {
  if (!supabase) return
  await Promise.allSettled([
    checkStuckTasks(),
    checkCrashedWorkers(),
    checkMemoryLeak(),
    checkFailureSpike(),
    checkRoutes(),
  ])
}

async function loop() {
  if (stopped) return
  try {
    await tick()
  } catch (e) {
    console.error(`[watchdog] tick faalde: ${e?.message ?? e}`)
  } finally {
    timer = setTimeout(loop, WATCHDOG_INTERVAL_MS)
    timer.unref?.()
  }
}

export function startWatchdog() {
  if (timer) return
  if (!supabase) return
  console.log(`[orchestrator] watchdog start (interval=${WATCHDOG_INTERVAL_MS}ms)`)
  loop()
}

export function stopWatchdog() {
  stopped = true
  if (timer) clearTimeout(timer)
  timer = null
}

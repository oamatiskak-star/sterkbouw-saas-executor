// Shared state: Supabase client, worker_id, config.
// Geen mock data — vereist echte env vars.

import { createClient } from '@supabase/supabase-js'
import os from 'node:os'

// Orchestrator-tabellen leven in orlando-core-os Supabase.
// ao.js (executor_tasks) leeft op sterkbouw Supabase.
// Daarom dedicated ORCHESTRATOR_* env vars met fallback naar de bestaande
// SUPABASE_* zodat lokaal draaien tegen één DB nog steeds werkt.
const ORCH_SUPABASE_URL =
  process.env.ORCHESTRATOR_SUPABASE_URL ?? process.env.SUPABASE_URL
const ORCH_SUPABASE_KEY =
  process.env.ORCHESTRATOR_SUPABASE_SERVICE_ROLE_KEY ??
  process.env.SUPABASE_SERVICE_ROLE_KEY

if (!ORCH_SUPABASE_URL || !ORCH_SUPABASE_KEY) {
  console.warn(
    '[orchestrator] ORCHESTRATOR_SUPABASE_URL / ORCHESTRATOR_SUPABASE_SERVICE_ROLE_KEY ' +
    '(of SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY fallback) ontbreken — orchestrator inactief'
  )
}

export const supabase = ORCH_SUPABASE_URL && ORCH_SUPABASE_KEY
  ? createClient(ORCH_SUPABASE_URL, ORCH_SUPABASE_KEY, {
      auth: { persistSession: false, autoRefreshToken: false },
    })
  : null

export const WORKER_ID =
  process.env.ORCHESTRATOR_WORKER_ID ?? `orch-${os.hostname()}-${process.pid}`

export const HOSTNAME = os.hostname()

export const POLL_INTERVAL_MS = parseInt(
  process.env.ORCHESTRATOR_POLL_INTERVAL_MS ?? '2000', 10
)
export const HEARTBEAT_INTERVAL_MS = parseInt(
  process.env.ORCHESTRATOR_HEARTBEAT_INTERVAL_MS ?? '10000', 10
)
export const MAX_CONCURRENCY = Math.max(1, parseInt(
  process.env.ORCHESTRATOR_MAX_CONCURRENCY ?? '1', 10
))
export const TASK_TIMEOUT_MS = parseInt(
  process.env.ORCHESTRATOR_TASK_TIMEOUT_MS ?? '600000', 10
) // 10 min default
export const WORK_DIR =
  process.env.ORCHESTRATOR_WORK_DIR ?? '/tmp/orchestrator'

export const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY ?? null
export const ANTHROPIC_MODEL =
  process.env.ANTHROPIC_MODEL ?? 'claude-sonnet-4-6'

export const CLAUDE_CODE_BIN = process.env.CLAUDE_CODE_BIN ?? 'claude'

export function isOrchestratorEnabled() {
  return process.env.ORCHESTRATOR_ENABLED === 'true' && supabase !== null
}

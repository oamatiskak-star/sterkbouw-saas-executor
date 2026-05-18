// Shared state: Supabase client, worker_id, config.
// Geen mock data — vereist echte env vars.

import { createClient } from '@supabase/supabase-js'
import os from 'node:os'

const SUPABASE_URL = process.env.SUPABASE_URL
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!SUPABASE_URL || !SUPABASE_KEY) {
  // De executor controleert dit al bij startup; hier nogmaals voor zekerheid.
  console.warn('[orchestrator] SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY ontbreken — orchestrator inactief')
}

export const supabase = SUPABASE_URL && SUPABASE_KEY
  ? createClient(SUPABASE_URL, SUPABASE_KEY, {
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

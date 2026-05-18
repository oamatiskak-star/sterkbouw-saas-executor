// Shell handler: voert commando's uit via execFile met strict allowlist.
// Allowlist komt uit orchestrator_memory key 'orchestrator.shell.allowlist'
// (default = leeg → alleen execFile-style geen-shell commands toegestaan).
//
// task.payload.command = string (eerste woord = bin), of array [bin, ...args]
// task.allowed_actions moet 'execute' bevatten.

import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { supabase } from '../state.js'
import { logTask } from '../logging.js'

const exec = promisify(execFile)

async function loadAllowlist() {
  if (!supabase) return []
  const { data } = await supabase
    .from('orchestrator_memory')
    .select('value')
    .eq('scope', 'global')
    .eq('key', 'orchestrator.shell.allowlist')
    .maybeSingle()
  const v = data?.value
  if (!v) return []
  if (Array.isArray(v)) return v
  if (typeof v === 'string') return v.split(',').map((s) => s.trim()).filter(Boolean)
  return []
}

export async function runShell(task) {
  if (!task.allowed_actions?.includes('execute')) {
    throw new Error('shell handler vereist allowed_actions: ["execute"]')
  }

  const cmd = task.payload?.command
  if (!cmd) throw new Error('payload.command ontbreekt')

  const [bin, ...args] = Array.isArray(cmd)
    ? cmd
    : String(cmd).split(/\s+/).filter(Boolean)

  const allowlist = await loadAllowlist()
  if (allowlist.length === 0) {
    throw new Error('shell allowlist leeg — zet orchestrator_memory["orchestrator.shell.allowlist"]')
  }
  if (!allowlist.includes(bin)) {
    throw new Error(`commando "${bin}" niet op allowlist`)
  }

  await logTask(task.id, 'info', `Shell exec: ${bin} ${args.join(' ')}`)

  const { stdout, stderr } = await exec(bin, args, {
    timeout: 60_000,
    maxBuffer: 4 * 1024 * 1024,
    cwd: task.payload?.cwd,
    env: { ...process.env, ...(task.payload?.env ?? {}) },
  })

  await logTask(task.id, 'info', 'Shell klaar', {
    stdout_len: stdout.length,
    stderr_len: stderr.length,
    stdout_tail: stdout.slice(-2000),
    stderr_tail: stderr.slice(-2000),
  })

  return { ok: true, stdout, stderr }
}

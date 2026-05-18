// Claude Code handler: spawnt de `claude` CLI in print-mode binnen een
// per-task werkmap. De handler streamt stdout/stderr naar task_logs en
// returnt de samenvatting bij exit code 0.
//
// allowed_actions wordt 1-op-1 doorgegeven aan --allowed-tools.
//
// Vereist:
//   - `claude` op PATH (of CLAUDE_CODE_BIN env var → absolute pad)
//   - ANTHROPIC_API_KEY in env zodat de CLI auth heeft
//
// payload:
//   - workdir?: string  — werkmap (default ORCHESTRATOR_WORK_DIR/<task_id>)
//   - prompt?:  string  — extra context bovenop objective

import { spawn } from 'node:child_process'
import { mkdir } from 'node:fs/promises'
import path from 'node:path'
import { CLAUDE_CODE_BIN, WORK_DIR } from '../state.js'
import { logTask } from '../logging.js'
import { loadContext, renderContext } from '../memoryContext.js'

function buildPrompt(task, memoryCtx) {
  const lines = [
    `# Taak: ${task.title}`,
    '',
    '## Objectives',
    ...task.objective.map((o, i) => `${i + 1}. ${o}`),
    '',
    '## Success conditions',
    ...task.success_condition.map((s, i) => `${i + 1}. ${s}`),
  ]
  if (task.notes?.length) {
    lines.push('', '## Notes', ...task.notes.map((n) => `- ${n}`))
  }
  if (task.payload?.prompt) {
    lines.push('', '## Extra context', task.payload.prompt)
  }
  if (task.escalation_response) {
    lines.push('', '## Human input (na escalation)', JSON.stringify(task.escalation_response))
  }
  const ctx = renderContext(memoryCtx ?? {})
  if (ctx) lines.push('', ctx)
  return lines.join('\n')
}

export async function runClaudeCode(task) {
  const workdir =
    task.payload?.workdir ?? path.join(WORK_DIR, `task-${task.id}`)
  await mkdir(workdir, { recursive: true })

  const allowedTools = (task.allowed_actions ?? []).join(',')
  const memoryCtx = await loadContext()
  await logTask(task.id, 'info', 'Memory context geladen', { keys: Object.keys(memoryCtx) })
  const prompt = buildPrompt(task, memoryCtx)

  const args = ['--print']
  if (allowedTools) args.push('--allowed-tools', allowedTools)
  if (task.safe_mode) args.push('--permission-mode', 'plan')

  await logTask(task.id, 'info', `Claude Code starten in ${workdir}`, {
    bin: CLAUDE_CODE_BIN,
    args,
  })

  const child = spawn(CLAUDE_CODE_BIN, args, {
    cwd: workdir,
    env: process.env,
    stdio: ['pipe', 'pipe', 'pipe'],
  })

  child.stdin.write(prompt)
  child.stdin.end()

  let stdout = ''
  let stderr = ''
  child.stdout.on('data', (chunk) => { stdout += chunk.toString() })
  child.stderr.on('data', (chunk) => { stderr += chunk.toString() })

  const exitCode = await new Promise((resolve, reject) => {
    child.on('error', reject)
    child.on('close', resolve)
  })

  await logTask(task.id, exitCode === 0 ? 'info' : 'error', `Claude Code exit ${exitCode}`, {
    stdout_tail: stdout.slice(-4000),
    stderr_tail: stderr.slice(-4000),
  })

  if (exitCode !== 0) {
    throw new Error(`Claude Code exited met code ${exitCode}: ${stderr.slice(-500)}`)
  }

  return { ok: true, summary: stdout.slice(-2000), workdir }
}

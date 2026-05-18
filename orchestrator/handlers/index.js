// Dispatcher: routeert op task.executor.

import { runAnthropic   } from './anthropic.js'
import { runClaudeCode  } from './claudeCode.js'
import { runShell       } from './shell.js'

export const HANDLERS = {
  anthropic:     runAnthropic,
  'claude-code': runClaudeCode,
  shell:         runShell,
}

export function selectHandler(task) {
  const h = HANDLERS[task.executor]
  if (!h) throw new Error(`onbekende executor: ${task.executor}`)
  return h
}

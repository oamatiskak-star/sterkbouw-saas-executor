// Dispatcher: routeert op task.executor.

import { runAnthropic       } from './anthropic.js'
import { runClaudeCode      } from './claudeCode.js'
import { runShell           } from './shell.js'
import { runViralScanner    } from './viralScanner.js'
import { runContentFactory  } from './forge.js'
import { runGravityDetector } from './gravityDetector.js'
import { runAtlasUpload     } from './atlas.js'

export const HANDLERS = {
  anthropic:           runAnthropic,
  'claude-code':       runClaudeCode,
  shell:               runShell,
  'viral_scanner':     runViralScanner,
  'content_factory':   runContentFactory,
  'gravity_detector':  runGravityDetector,
  'atlas_upload':      runAtlasUpload,
}

export function selectHandler(task) {
  const h = HANDLERS[task.executor]
  if (!h) throw new Error(`onbekende executor: ${task.executor}`)
  return h
}

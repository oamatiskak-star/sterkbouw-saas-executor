// Dispatcher: routeert op task.executor.

import { runAnthropic           } from './anthropic.js'
import { runClaudeCode          } from './claudeCode.js'
import { runShell               } from './shell.js'
import { runViralScanner        } from './viralScanner.js'
import { runContentFactory      } from './forge.js'
import { runGravityDetector     } from './gravityDetector.js'
import { runAtlasUpload         } from './atlas.js'
import { runRenderer            } from './renderer.js'
import { runTrendScanner        } from './trendScanner.js'
import { runRetentionLab        } from './retentionLab.js'
import { runWinnerExtractor     } from './winnerExtractor.js'
import { runAudioScanner        } from './audioScanner.js'
import { runSponsorEngine       } from './sponsorEngine.js'
import { runMonetizationTracker } from './monetizationTracker.js'
import { runLanguageExpander    } from './languageExpander.js'
import { runCronDispatcher      } from './cronDispatcher.js'

export const HANDLERS = {
  anthropic:               runAnthropic,
  'claude-code':           runClaudeCode,
  shell:                   runShell,
  'viral_scanner':         runViralScanner,
  'content_factory':       runContentFactory,
  'gravity_detector':      runGravityDetector,
  'atlas_upload':          runAtlasUpload,
  'renderer':              runRenderer,
  'trend_scanner':         runTrendScanner,
  'retention_lab':         runRetentionLab,
  'winner_extractor':      runWinnerExtractor,
  'audio_scanner':         runAudioScanner,
  'sponsor_engine':        runSponsorEngine,
  'monetization_tracker':  runMonetizationTracker,
  'language_expander':     runLanguageExpander,
  'cron_dispatcher':       runCronDispatcher,
}

export function selectHandler(task) {
  const h = HANDLERS[task.executor]
  if (!h) throw new Error(`onbekende executor: ${task.executor}`)
  return h
}

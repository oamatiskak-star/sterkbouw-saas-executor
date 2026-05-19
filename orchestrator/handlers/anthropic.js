// Anthropic SDK handler: voert taken uit via tool-use loop.
// Toolset wordt bepaald door task.allowed_actions:
//   - 'read'      → read_file, list_dir
//   - 'ask_human' → ask_human (triggert escalation)
//   - 'complete'  → altijd impliciet beschikbaar
//
// Schrijf-, shell- en netwerk-acties zijn in deze handler NIET beschikbaar.
// Voor code-mutaties: gebruik executor='claude-code'.

import Anthropic from '@anthropic-ai/sdk'
import fs from 'node:fs/promises'
import path from 'node:path'
import { ANTHROPIC_API_KEY, ANTHROPIC_MODEL, WORK_DIR } from '../state.js'
import { logTask } from '../logging.js'
import { ask, WaitingForHumanInput } from '../escalation.js'
import { loadContext, renderContext } from '../memoryContext.js'

const TOOL_DEFS = {
  read_file: {
    name: 'read_file',
    description: 'Lees een tekstbestand binnen de werkmap van deze taak.',
    input_schema: {
      type: 'object',
      properties: { path: { type: 'string', description: 'Relatief pad t.o.v. de werkmap' } },
      required: ['path'],
    },
  },
  list_dir: {
    name: 'list_dir',
    description: 'Lijst bestanden in een map binnen de werkmap.',
    input_schema: {
      type: 'object',
      properties: { path: { type: 'string', description: 'Relatief pad, lege string = root' } },
      required: ['path'],
    },
  },
  ask_human: {
    name: 'ask_human',
    description:
      'Stel een vraag aan de operator. De taak wordt gepauzeerd tot een antwoord arriveert via het dashboard.',
    input_schema: {
      type: 'object',
      properties: { question: { type: 'string' } },
      required: ['question'],
    },
  },
  complete: {
    name: 'complete',
    description: 'Markeer de taak als klaar. Geef een korte samenvatting van het resultaat.',
    input_schema: {
      type: 'object',
      properties: { summary: { type: 'string' } },
      required: ['summary'],
    },
  },
}

function selectTools(allowedActions) {
  const tools = [TOOL_DEFS.complete]
  const a = new Set(allowedActions ?? [])
  // '*' wildcard betekent: alle non-write tools (read + ask_human + complete).
  // Schrijf/shell/netwerk-acties zitten bewust niet in deze handler.
  const all = a.has('*')
  if (all || a.has('read')) {
    tools.push(TOOL_DEFS.read_file, TOOL_DEFS.list_dir)
  }
  if (all || a.has('ask_human')) {
    tools.push(TOOL_DEFS.ask_human)
  }
  return tools
}

function safePath(base, rel) {
  const full = path.resolve(base, rel ?? '')
  const baseResolved = path.resolve(base)
  if (!full.startsWith(baseResolved)) {
    throw new Error(`pad buiten werkmap: ${rel}`)
  }
  return full
}

async function runTool(name, input, ctx, task) {
  if (name === 'read_file') {
    const p = safePath(ctx.workdir, input.path)
    const data = await fs.readFile(p, 'utf8')
    return data.slice(0, 50_000)
  }
  if (name === 'list_dir') {
    const p = safePath(ctx.workdir, input.path)
    const entries = await fs.readdir(p, { withFileTypes: true })
    return entries.map((e) => ({ name: e.name, type: e.isDirectory() ? 'dir' : 'file' }))
  }
  if (name === 'ask_human') {
    await ask(task, input.question, { _from: 'anthropic-handler' })
    // ask() throws — we komen hier niet
    return null
  }
  if (name === 'complete') {
    ctx.completed = true
    ctx.summary = input.summary
    return 'ok'
  }
  throw new Error(`onbekend tool: ${name}`)
}

function systemPrompt(task, memoryCtx) {
  const base = [
    `Je bent een AI-agent in de Orlando Core OS orchestrator (worker-context).`,
    `Taak: "${task.title}".`,
    `Werk methodisch elk objective af. Eindig altijd met de complete-tool.`,
    task.safe_mode
      ? `Safe mode: ALLEEN read-only acties. Geen schrijven, geen netwerk.`
      : ``,
  ].filter(Boolean).join(' ')
  const ctx = renderContext(memoryCtx)
  return ctx ? `${base}\n${ctx}` : base
}

function userPrompt(task) {
  const parts = [
    '## Objectives',
    ...task.objective.map((o, i) => `${i + 1}. ${o}`),
    '',
    '## Success conditions',
    ...task.success_condition.map((s, i) => `${i + 1}. ${s}`),
  ]
  if (task.notes?.length) {
    parts.push('', '## Notes', ...task.notes.map((n) => `- ${n}`))
  }
  if (task.escalation_response) {
    parts.push('', '## Human input (na escalation)', JSON.stringify(task.escalation_response))
  }
  return parts.join('\n')
}

export async function runAnthropic(task) {
  if (!ANTHROPIC_API_KEY) {
    throw new Error('ANTHROPIC_API_KEY niet geconfigureerd — anthropic handler kan niet draaien')
  }

  const workdir = task.payload?.workdir ?? path.join(WORK_DIR, `task-${task.id}`)
  await fs.mkdir(workdir, { recursive: true })

  const anthropic = new Anthropic({ apiKey: ANTHROPIC_API_KEY })
  const tools = selectTools(task.allowed_actions)
  const memoryCtx = await loadContext()
  await logTask(task.id, 'info', 'Memory context geladen', {
    keys: Object.keys(memoryCtx),
  })

  const ctx = { workdir, completed: false, summary: '' }
  const messages = [{ role: 'user', content: userPrompt(task) }]
  const sys = systemPrompt(task, memoryCtx)

  const MAX_TURNS = 24
  const MAX_TOKENS = parseInt(process.env.ORCHESTRATOR_MAX_TOKENS ?? '16384', 10)
  for (let turn = 0; turn < MAX_TURNS; turn++) {
    const resp = await anthropic.messages.create({
      model:       ANTHROPIC_MODEL,
      max_tokens:  MAX_TOKENS,
      system:      sys,
      tools,
      messages,
    })

    await logTask(task.id, 'info', `LLM turn ${turn + 1} stop_reason=${resp.stop_reason}`, {
      usage: resp.usage,
    })

    // Capture partial text als max_tokens is gehit — dan eindigt deze turn
    // mogelijk zonder complete() tool call en gaat de output anders verloren.
    const textParts = resp.content
      .filter((c) => c.type === 'text')
      .map((c) => c.text)
      .join('\n')

    if (resp.stop_reason === 'max_tokens') {
      await logTask(task.id, 'warn', `LLM bereikte max_tokens (${MAX_TOKENS}) — output mogelijk afgekapt`, {
        partial_text_len: textParts.length,
      })
      if (textParts) {
        // Behoud zoveel mogelijk; complete() krijgt mogelijk niet de kans om te firen
        ctx.summary = textParts.slice(0, 8000)
      }
    }

    messages.push({ role: 'assistant', content: resp.content })

    const toolUses = resp.content.filter((c) => c.type === 'tool_use')

    if (toolUses.length === 0) {
      // Geen tool call — sluit af veilig
      await logTask(task.id, 'warn', 'LLM stopte zonder complete-tool')
      if (textParts) ctx.summary = textParts.slice(0, 8000)
      ctx.completed = true
      break
    }

    // Stop ook bij max_tokens als de tool_use mogelijk corrupt is
    if (resp.stop_reason === 'max_tokens') {
      ctx.completed = true
      break
    }

    const toolResults = []
    for (const tu of toolUses) {
      try {
        const out = await runTool(tu.name, tu.input ?? {}, ctx, task)
        toolResults.push({
          type:         'tool_result',
          tool_use_id:  tu.id,
          content:      typeof out === 'string' ? out : JSON.stringify(out),
        })
      } catch (e) {
        if (e instanceof WaitingForHumanInput) throw e
        toolResults.push({
          type:         'tool_result',
          tool_use_id:  tu.id,
          is_error:     true,
          content:      e instanceof Error ? e.message : String(e),
        })
      }
    }

    messages.push({ role: 'user', content: toolResults })

    if (ctx.completed) break
  }

  if (!ctx.completed) {
    throw new Error(`anthropic handler bereikte MAX_TURNS zonder complete()`)
  }

  return { ok: true, summary: ctx.summary }
}

// Escalation: handler vraagt om menselijke input.
// Implementatie: task wordt status='waiting' gezet met escalation_question
// en paused_state. Worker geeft taak vrij. Wanneer een mens via
// /api/orchestrator/tasks/[id]/escalation antwoordt, gaat status terug
// naar 'open' en wordt de taak opnieuw geclaimd. Bij re-claim leest de
// handler escalation_response + paused_state en hervat.
//
// De ask() helper gooit een speciale fout (WaitingForHumanInput) die door
// de dispatcher wordt opgevangen — dat voorkomt dat de taak op 'failed'
// belandt.

import { supabase } from './state.js'
import { logTask } from './logging.js'

export class WaitingForHumanInput extends Error {
  constructor(question) {
    super(`Wacht op input: ${question}`)
    this.name = 'WaitingForHumanInput'
  }
}

/**
 * @param {object} task - de huidige taak row
 * @param {string} question - vraag aan operator
 * @param {object} pausedState - state om later mee te hervatten
 */
export async function ask(task, question, pausedState = {}) {
  if (!supabase) throw new Error('escalation: supabase niet geconfigureerd')

  await logTask(task.id, 'info', 'Escalation gestart', { question })

  const { error } = await supabase
    .from('orchestrator_tasks')
    .update({
      status:              'waiting',
      escalation_question: question,
      paused_state:        pausedState,
    })
    .eq('id', task.id)

  if (error) throw new Error(`escalation update faalde: ${error.message}`)

  throw new WaitingForHumanInput(question)
}

import * as calculatiesBouw from "./actions/calculaties_bouw.js"
import { runBuilder } from "../builder/index.js"

/*
CENTRALE ACTION REGISTRY
– Alleen acties die echt bestaan
– Geen dode imports
– Builder intern
*/

const handlers = {
  "calculaties:bouw": calculatiesBouw
}

/*
IN-MEMORY STATUS
– Later vervangen door Supabase / Redis
*/

const state = {}

/*
START ACTIE
*/
export async function runAction(actionId, payload = {}) {
  if (actionId === "RUN_BUILDER") {
    state[actionId] = {
      state: "BEZIG",
      actionId,
      startedAt: Date.now()
    }

    try {
      const result = await runBuilder(payload)

      state[actionId] = {
        state: "KLAAR",
        actionId,
        finishedAt: Date.now(),
        result
      }

      return state[actionId]
    } catch (err) {
      state[actionId] = {
        state: "FOUT",
        actionId,
        error: err.message || "BUILDER_FOUT",
        at: Date.now()
      }

      return state[actionId]
    }
  }

  const handler = handlers[actionId]

  if (!handler || typeof handler.run !== "function") {
    state[actionId] = {
      state: "FOUT",
      error: "ACTIE_NIET_GEVONDEN",
      actionId,
      at: Date.now()
    }

    return state[actionId]
  }

  state[actionId] = {
    state: "BEZIG",
    actionId,
    startedAt: Date.now()
  }

  try {
    const result = await handler.run(payload)

    state[actionId] = {
      state: "KLAAR",
      actionId,
      finishedAt: Date.now(),
      result
    }

    return state[actionId]
  } catch (err) {
    state[actionId] = {
      state: "FOUT",
      actionId,
      error: err.message || "ONBEKENDE_FOUT",
      at: Date.now()
    }

    return state[actionId]
  }
}

/*
STATUS OPVRAGEN
*/
export async function getStatus(actionId) {
  return state[actionId] || {
    state: "ONBEKEND",
    actionId
  }
}

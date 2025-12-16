import * as calculatiesBouw from "./actions/calculaties_bouw.js"
import * as calculatiesEW from "./actions/calculaties_ew.js"
import * as architectenBouwtekening from "./actions/architecten_bouwtekening.js"
import * as planningGenereer from "./actions/planning_genereer.js"
import * as documentenUpload from "./actions/documenten_upload.js"

import { runBuilder } from "../builder/index.js"

/*
CENTRALE ACTION REGISTRY
– Elke actie heeft exact één handler
– Executor is leidend
– Builder draait intern
*/

const handlers = {
  "calculaties:bouw": calculatiesBouw,
  "calculaties:ew": calculatiesEW,
  "architecten:bouwtekening": architectenBouwtekening,
  "planning:genereer": planningGenereer,
  "documenten:upload": documentenUpload
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

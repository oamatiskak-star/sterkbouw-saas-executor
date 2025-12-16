import * as calculatiesBouw from "./actions/calculaties_bouw.js"
import { runBuilder } from "../builder/index.js"

/*
CENTRALE ACTION REGISTRY
– Alleen bestaande acties
– Architect en Builder geïntegreerd
*/

const handlers = {
  "calculaties:bouw": calculatiesBouw
}

/*
IN-MEMORY STATUS
– Later te vervangen
*/

const state = {}

/*
START ACTIE
*/
export async function runAction(actionId, payload = {}) {

  /*
  ========================
  ARCHITECT – FULL BUILD
  ========================
  */
  if (actionId === "architect:full_production_build") {
    console.log("ARCHITECT FULL PRODUCTION BUILD START")

    const modules = payload.payload?.modules || []

    state[actionId] = {
      state: "BEZIG",
      actionId,
      startedAt: Date.now()
    }

    try {
      for (const module of modules) {
        console.log("ARCHITECT MODULE", module.name)

        for (const action of module.actions) {
          console.log("ARCHITECT SUBTASK", module.name, action)

          await runBuilder({
            action: `${module.name}:${action}`,
            project_id: payload.project_id || null
          })
        }
      }

      state[actionId] = {
        state: "KLAAR",
        actionId,
        finishedAt: Date.now()
      }

      console.log("ARCHITECT FULL PRODUCTION BUILD DONE")
      return state[actionId]

    } catch (err) {
      state[actionId] = {
        state: "FOUT",
        actionId,
        error: err.message || "ARCHITECT_FOUT",
        at: Date.now()
      }

      return state[actionId]
    }
  }

  /*
  ========================
  DIRECT BUILDER CALL
  ========================
  */
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

  /*
  ========================
  STANDAARD ACTIONS
  ========================
  */
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

import { runForceBuilder } from "../builder/forceBuilder.js"
import * as calculatiesBouw from "./actions/calculaties_bouw.js"
import * as calculatiesEW from "./actions/calculaties_ew.js"

/*
========================
ACTION ROUTER
– FORCE heeft altijd voorrang
– Geen SKIP meer
========================
*/

export async function runAction(actionId, task) {
  const force = task?.payload?.force === true

  // FORCE MODE: altijd via forceBuilder
  if (force) {
    return runForceBuilder(task)
  }

  // NORMALE ACTIONS (fallback)
  switch (actionId) {
    case "calculaties:bouw":
      return calculatiesBouw.run(task)

    case "calculaties:ew":
      return calculatiesEW.run(task)

    default:
      console.log("ACTION GEEN HANDLER, FORCE AAN TE RADEN:", actionId)
      return null
  }
}

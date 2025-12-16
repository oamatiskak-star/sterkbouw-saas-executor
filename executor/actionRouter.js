import { runBuilder } from "../builder/index.js"

export async function runAction(actionId, payload) {
  if (actionId === "builder:generate_module") {
    return await runBuilder(payload)
  }

  throw new Error("ONBEKENDE_ACTION")
}

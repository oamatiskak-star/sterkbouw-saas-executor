import * as calculatiesBouw from "../executor/actions/calculaties_bouw.js"

export async function runBuilder(task) {
  console.log("BUILDER START", task.id || "geen-id")

  if (task.action === "calculaties:bouw") {
    return await calculatiesBouw.run(task)
  }

  console.log("BUILDER GEEN ACTIE VOOR", task.action)
  return { ok: false, reason: "ONBEKENDE_BUILDER_ACTIE" }
}

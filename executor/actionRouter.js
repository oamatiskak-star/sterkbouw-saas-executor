import { runForceBuilder } from "../builder/forceBuilder.js"

export async function runAction(actionId, task) {
  const force = task?.payload?.force === true

  if (force) {
    return runForceBuilder(task)
  }

  console.log("NIET-FORCE TASK GENEGEERD:", actionId)
  return null
}

import { runRemap } from "../remap/remapEngine.js"
import { buildDocuments } from "../agent/documents.js"

export async function runBuilder(task) {
  console.log("BUILDER START", task.id)

  if (task.action === "REMAP") {
    await runRemap(task)
    return
  }

  if (task.action === "DOCUMENTS") {
    await buildDocuments(task)
    return
  }

  console.log("BUILDER GEEN ACTIE", task.action)
}

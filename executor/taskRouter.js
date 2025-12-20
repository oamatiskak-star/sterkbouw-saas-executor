import { handleProjectScan } from "./handlers/projectScan.js"
import { handleStartRekenwolk } from "./handlers/startRekenwolk.js"
import { handleGenerateStabu } from "./handlers/generateStabu.js"
import { handleDeriveQuantities } from "./handlers/deriveQuantities.js"

export async function routeTask(task) {
  switch (task.task_type) {
    case "PROJECT_SCAN":
      return handleProjectScan(task)

    case "START_REKENWOLK":
      return handleStartRekenwolk(task)

    case "GENERATE_STABU":
      return handleGenerateStabu(task)

    case "DERIVE_QUANTITIES":
      return handleDeriveQuantities(task)

    default:
      throw new Error(`UNKNOWN_TASK_TYPE: ${task.task_type}`)
  }
}

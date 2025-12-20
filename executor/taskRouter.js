import { handleProjectScan } from "./handlers/projectScan.js"
import { handleStartRekenwolk } from "./handlers/startRekenwolk.js"
import { handleGenerateStabu } from "./handlers/generateStabu.js"
import { handleDeriveQuantities } from "./handlers/deriveQuantities.js"
import { handleInstallationsE } from "./handlers/handleInstallationsE.js"
import { handleInstallationsW } from "./handlers/handleInstallationsW.js"
import { handlePlanning } from "./handlers/handlePlanning.js"
import { handleFinalizeRekenwolk } from "./handlers/finalizeRekenwolk.js"

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

    case "INSTALLATIES_E":
      return handleInstallationsE(task)

    case "INSTALLATIES_W":
      return handleInstallationsW(task)

    case "PLANNING":
      return handlePlanning(task)

    case "FINALIZE_REKENWOLK":
      return handleFinalizeRekenwolk(task)

    default:
      throw new Error(`UNKNOWN_TASK_TYPE: ${task.task_type}`)
  }
}

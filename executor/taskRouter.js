import { handleProjectScan } from "./handlers/projectScan.js"
import { handleStartRekenwolk } from "./handlers/startRekenwolk.js"

export async function routeTask(task) {
  switch (task.task_type) {
    case "PROJECT_SCAN":
      return handleProjectScan(task)

    case "START_REKENWOLK":
      return handleStartRekenwolk(task)

    default:
      throw new Error(`UNKNOWN_TASK_TYPE: ${task.task_type}`)
  }
}

import { handleProjectScan } from "./handlers/projectScan.js"
import { handleStartRekenwolk } from "./handlers/startRekenwolk.js"
import { handleGenerateStabu } from "./handlers/generateStabu.js"
import { handleDeriveQuantities } from "./handlers/deriveQuantities.js"
import { handleInstallationsE } from "./handlers/handleInstallationsE.js"
import { handleInstallationsW } from "./handlers/handleInstallationsW.js"
import { handlePlanning } from "./handlers/handlePlanning.js"
import { handleGenerateReportPdf } from "./handlers/generateReportPdf.js"
import { handleGenerateAssumptionsReport } from "./handlers/generateAssumptionsReport.js"
import { handleGenerateRiskReport } from "./handlers/generateRiskReport.js"
import { handleFinalizeRekenwolk } from "./handlers/finalizeRekenwolk.js"
import { startCalculationFromRun } from "./actions/startCalculationFromRun.js"

function normalize(action) {
  return String(action)
    .toLowerCase()
    .replace(/[^a-z0-9_]+/g, "_")
    .replace(/^_|_$/g, "")
}

export async function routeAction(task) {
  if (!task || !task.action) {
    throw new Error("ROUTE_ACTION_MISSING_ACTION")
  }

  const action = normalize(task.action)

  switch (action) {
    case "project_scan":
      return handleProjectScan(task)

    case "start_rekenwolk":
      return handleStartRekenwolk(task)

    case "generate_stabu":
      return handleGenerateStabu(task)

    case "derive_quantities":
      return handleDeriveQuantities(task)

    case "installaties_e":
      return handleInstallationsE(task)

    case "installaties_w":
      return handleInstallationsW(task)

    case "planning":
      return handlePlanning(task)

    case "generate_report_pdf":
      return handleGenerateReportPdf(task)

    case "generate_assumptions_report":
      return handleGenerateAssumptionsReport(task)

    case "generate_risk_report":
      return handleGenerateRiskReport(task)

    case "finalize_rekenwolk":
      return handleFinalizeRekenwolk(task)

    case "start_calculation":
      return startCalculationFromRun({
        task_id: task.id,
        project_id: task.project_id || task.payload?.project_id,
        payload: task.payload || {}
      })

    default:
      throw new Error(`UNKNOWN_ACTION: ${action}`)
  }
}

import { createClient } from "@supabase/supabase-js"
import { sendTelegram } from "../integrations/telegramSender.js"

// PDF – alleen eindproduct
import { generate2joursPdf } from "./pdf/generate2joursPdf.js"

// Handlers
import { handleUploadFiles } from "./handlers/uploadFiles.js"
import { handleProjectScan } from "./handlers/projectScan.js"
import { handleGenerateStabu } from "./handlers/generateStabu.js"
import { handleStartRekenwolk } from "./handlers/startRekenwolk.js"

// Builder / Monteur
import { runBuilder } from "../builder/index.js"
import { startCalculationFromRun } from "./actions/startCalculationFromRun.js"

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
)

function log(...args) {
  console.log("[EXECUTOR]", ...args)
}

function normalize(raw) {
  if (!raw || typeof raw !== "string") return null
  return raw.toLowerCase().replace(/[^a-z0-9_]+/g, "_")
}

export async function runAction(task) {
  if (!task || !task.id) {
    throw new Error("RUNACTION_INVALID_TASK")
  }

  // 🔒 HARD GUARD — alleen OPEN executor-taken
  if (task.status !== "open" || task.assigned_to !== "executor") {
    log("SKIP_TASK", { id: task.id, status: task.status })
    return { state: "SKIPPED" }
  }

  const payload =
    task.payload && typeof task.payload === "object" ? task.payload : {}

  const action = normalize(
    task.action ||
    payload.action ||
    payload.actionId ||
    null
  )

  if (!action) {
    throw new Error("ACTION_MISSING")
  }

  const project_id = task.project_id || payload.project_id
  if (!project_id) {
    throw new Error("PROJECT_ID_MISSING")
  }

  log("TASK_START", { id: task.id, action, project_id })

  // Markeer task direct als running → voorkomt dubbel uitvoeren
  await supabase
    .from("executor_tasks")
    .update({
      status: "running",
      started_at: new Date().toISOString()
    })
    .eq("id", task.id)

  try {

    /* ==================================================
       SYSTEM / BUILDER
    ================================================== */
    if (
      action === "system_repair_full_chain" ||
      action === "system_full_scan"
    ) {
      await runBuilder({ ...payload, action, project_id, task_id: task.id })
    }

    /* ==================================================
       UPLOAD
    ================================================== */
    else if (action === "upload" || action === "upload_files") {
      await handleUploadFiles({ id: task.id, project_id, payload })
    }

    /* ==================================================
       PROJECT SCAN
    ================================================== */
    else if (action === "project_scan") {
      await handleProjectScan({ id: task.id, project_id, payload })
    }

    /* ==================================================
       GENERATE STABU
    ================================================== */
    else if (action === "generate_stabu") {
      await handleGenerateStabu({ id: task.id, project_id, payload })
    }

    /* ==================================================
       REKENWOLK = ENIGE PLAATS WAAR PDF WORDT GEMAAKT
    ================================================== */
    else if (action === "start_rekenwolk") {
      await handleStartRekenwolk({ id: task.id, project_id, payload })
      await generate2joursPdf(project_id)
    }

    /* ==================================================
       START CALCULATION (RUN-INIT)
    ================================================== */
    else if (action === "start_calculation") {
      await startCalculationFromRun({
        task_id: task.id,
        project_id,
        payload
      })
    }

    else {
      throw new Error(`UNSUPPORTED_ACTION: ${action}`)
    }

    // ✅ TASK KLAAR
    await supabase
      .from("executor_tasks")
      .update({
        status: "completed",
        finished_at: new Date().toISOString()
      })
      .eq("id", task.id)

    log("TASK_COMPLETED", { id: task.id, action })
    return { state: "DONE", action }

  } catch (err) {

    await supabase
      .from("executor_tasks")
      .update({
        status: "failed",
        error: err.message,
        finished_at: new Date().toISOString()
      })
      .eq("id", task.id)

    await sendTelegram(
      `[EXECUTOR FAILED]\nAction: ${action}\nProject: ${project_id}\nError: ${err.message}`
    )

    throw err
  }
}

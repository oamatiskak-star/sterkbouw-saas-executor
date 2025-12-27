import { createClient } from "@supabase/supabase-js"
import { sendTelegram } from "../integrations/telegramSender.js"

// PDF = SYSTEM OF RECORD
import { generate2joursPdf } from "./pdf/generate2joursPdf.js"

// PURE HANDLERS (ALLEEN DATA)
import { handleUploadFiles } from "./handlers/uploadFiles.js"
import { handleProjectScan } from "./handlers/projectScan.js"
import { handleGenerateStabu } from "./handlers/generateStabu.js"
import { handleStartRekenwolk } from "./handlers/startRekenwolk.js"

// MONTEUR / BUILDER
import { runBuilder } from "../builder/index.js"

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

/*
====================================================
HARD CONTRACT – NO EXCEPTIONS
====================================================
1. PDF bestaat DIRECT na upload
2. Elke task schrijft naar DEZELFDE PDF
3. Geen enkele stap mag door zonder PDF-write
4. PDF is leidend, database volgt
====================================================
*/

export async function runAction(task) {
  if (!task || !task.id) {
    throw new Error("RUNACTION_INVALID_TASK")
  }

  const payload =
    task.payload && typeof task.payload === "object" ? task.payload : {}

  const action = normalize(
    task.action ||
    task.action_id ||
    payload.actionId ||
    payload.action ||
    null
  )

  if (!action) {
    throw new Error("ACTION_MISSING")
  }

  const project_id =
    task.project_id ||
    payload.project_id ||
    null

  if (!project_id) {
    throw new Error("PROJECT_ID_MISSING")
  }

  log("TASK_START", {
    id: task.id,
    action,
    project_id
  })

  /*
  ==================================================
  0. MONTEUR / SYSTEM REPAIR (BUILDER)
  ==================================================
  */
  if (
    action === "system_repair_full_chain" ||
    action === "system_repair_full" ||
    action === "repair_full_system" ||
    action === "system_full_scan"
  ) {

    const result = await runBuilder({
      ...payload,
      action,
      project_id,
      task_id: task.id
    })

    log("SYSTEM_REPAIR_DONE", { action })
    return { state: "DONE", action, result }
  }

  /*
  ==================================================
  1. UPLOAD FILES
  ==================================================
  */
  if (action === "upload" || action === "upload_files") {

    await handleUploadFiles({
      id: task.id,
      project_id,
      payload
    })

    // ⬇️ HARD: PDF AANMAKEN + UPLOAD SECTIE
    await generate2joursPdf(project_id)

    log("UPLOAD_DONE + PDF_CREATED")
    return { state: "DONE", action }
  }

  /*
  ==================================================
  2. PROJECT SCAN
  ==================================================
  */
  if (action === "project_scan" || action === "analysis") {

    await handleProjectScan({
      id: task.id,
      project_id,
      payload
    })

    // ⬇️ HARD: PDF BIJWERKEN MET SCANRESULTAAT
    await generate2joursPdf(project_id)

    log("PROJECT_SCAN_DONE + PDF_UPDATED")
    return { state: "DONE", action }
  }

  /*
  ==================================================
  3. GENERATE STABU
  ==================================================
  */
  if (action === "generate_stabu") {

    await handleGenerateStabu({
      id: task.id,
      project_id,
      payload
    })

    // ⬇️ HARD: STABU → PDF
    await generate2joursPdf(project_id)

    log("GENERATE_STABU_DONE + PDF_UPDATED")
    return { state: "DONE", action }
  }

  /*
  ==================================================
  4. START REKENWOLK (EINDPRODUCT)
  ==================================================
  */
  if (action === "start_rekenwolk") {

    await handleStartRekenwolk({
      id: task.id,
      project_id,
      payload
    })

    // ⬇️ HARD: FINAL PDF
    await generate2joursPdf(project_id)

    log("REKENWOLK_DONE + FINAL_PDF")
    return { state: "DONE", action }
  }

  /*
  ==================================================
  ONBEKENDE ACTIE = STOP
  ==================================================
  */
  throw new Error(`UNSUPPORTED_ACTION: ${action}`)
}

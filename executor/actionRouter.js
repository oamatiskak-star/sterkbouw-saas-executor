// executor/actionRouter.js
import { createClient } from "@supabase/supabase-js"
import { runBuilder } from "../builder/index.js"
import { architectFullUiBuild } from "../actions/architectFullUiBuild.js"
import { sendTelegram } from "../integrations/telegramSender.js"

// HANDLERS (ALLEEN I/O / CONTEXT)
import { handleUploadFiles } from "./handlers/uploadFiles.js"
import { handleProjectScan } from "./handlers/projectScan.js"

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
)

const STRICT_MODE = true
const TELEGRAM_MODE = true

function log(...args) {
  // ÉÉN centrale logger → Railway stdout
  console.log("[EXECUTOR]", ...args)
}

async function telegramLog(chatId, message) {
  if (!TELEGRAM_MODE || !chatId) return
  try {
    await sendTelegram(chatId, message)
  } catch (_) {}
}

function normalizeActionId(raw) {
  if (!raw || typeof raw !== "string") return null
  return raw
    .toLowerCase()
    .replace(/[^a-z0-9_]+/g, "_")
    .replace(/^_|_$/g, "")
}

export async function runAction(task) {
  if (!task || !task.id) {
    throw new Error("RUNACTION_INVALID_TASK")
  }

  const payload =
    task.payload && typeof task.payload === "object" ? task.payload : {}

  const chatId = payload.chat_id || null

  const rawAction =
    task.action ||
    payload.actionId ||
    task.action_id ||
    task.type ||
    null

  const actionId = normalizeActionId(rawAction)

  if (STRICT_MODE && !actionId) {
    throw new Error("ACTION_ID_MISSING")
  }

  const project_id =
    task.project_id ||
    payload.project_id ||
    null

  log("TASK_START", {
    task_id: task.id,
    action: actionId,
    project_id
  })

  /*
  =========================
  ACTIES ZONDER PROJECT
  =========================
  */

  if (actionId === "architect_full_ui_pages_build") {
    log("BUILDER_UI_START")
    await telegramLog(chatId, "UI build gestart")

    const res = await architectFullUiBuild(task)

    await telegramLog(chatId, "UI build afgerond")
    log("BUILDER_UI_DONE", res)

    return { state: "DONE", action: actionId }
  }

  /*
  =========================
  PROJECT VERPLICHT
  =========================
  */

  if (!project_id) {
    throw new Error("RUNACTION_NO_PROJECT_ID")
  }

  /*
  =========================
  1. UPLOAD
  =========================
  */

  if (actionId === "upload" || actionId === "upload_files") {
    log("UPLOAD_START")

    await telegramLog(chatId, "Upload gestart")

    await handleUploadFiles({
      id: task.id,
      project_id,
      payload
    })

    await telegramLog(chatId, "Upload afgerond")
    log("UPLOAD_DONE")

    return { state: "DONE", action: actionId }
  }

  /*
  =========================
  2. PROJECT SCAN
  =========================
  */

  if (actionId === "project_scan" || actionId === "analysis") {
    log("PROJECT_SCAN_START")

    await telegramLog(chatId, "Projectscan gestart")

    await handleProjectScan({
      id: task.id,
      project_id,
      payload
    })

    await telegramLog(chatId, "Projectscan afgerond")
    log("PROJECT_SCAN_DONE")

    return { state: "DONE", action: actionId }
  }

  /*
  =========================
  3. BUILDER (CALCULATIE / PDF / SYSTEM)
  =========================
  */

  log("BUILDER_DISPATCH_START", {
    action: actionId,
    project_id
  })

  try {
    const result = await runBuilder({
      actionId,
      taskId: task.id,
      project_id,
      ...payload
    })

    log("BUILDER_DISPATCH_DONE", {
      action: actionId,
      result
    })

    return result
  } catch (err) {
    log("BUILDER_DISPATCH_ERROR", {
      action: actionId,
      error: err.message
    })
    throw err
  }
}

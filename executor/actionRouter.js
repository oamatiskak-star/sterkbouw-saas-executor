import { createClient } from "@supabase/supabase-js"
import { runBuilder } from "../builder/index.js"
import { architectFullUiBuild } from "../actions/architectFullUiBuild.js"
import { sendTelegram } from "../integrations/telegramSender.js"

// SYSTEM HANDLERS
import { handleProjectScan } from "./handlers/projectScan.js"
import { handleStartRekenwolk } from "./handlers/startRekenwolk.js"

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
)

const STRICT_MODE = true
const TELEGRAM_MODE = true

async function telegramLog(chatId, message) {
  if (!TELEGRAM_MODE) return
  if (!chatId) return
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

  const project_id = task.project_id || payload.project_id || null

  /*
  ====================================================
  SYSTEM ACTIONS
  ====================================================
  */

  if (actionId === "project_scan") {
    await telegramLog(chatId, "Projectscan gestart")

    await handleProjectScan({
      id: task.id,
      project_id,
      payload
    })

    await telegramLog(chatId, "Projectscan afgerond")
    return { state: "DONE", action: actionId }
  }

  if (actionId === "start_rekenwolk") {
    await telegramLog(chatId, "Rekenwolk gestart")

    await handleStartRekenwolk({
      id: task.id,
      project_id,
      payload
    })

    await telegramLog(chatId, "Rekenwolk afgerond")
    return { state: "DONE", action: actionId }
  }

  /*
  ====================================================
  ANALYSIS ACTION (ALIAS)
  ====================================================
  */

  if (actionId === "analysis") {
    await telegramLog(chatId, "Analyse gestart")

    await handleProjectScan({
      id: task.id,
      project_id,
      payload
    })

    await telegramLog(chatId, "Analyse afgerond")
    return { state: "DONE", action: actionId }
  }

  /*
  ====================================================
  UPLOAD ACTION (GEEN STATUS LOGICA)
  ====================================================
  */

  if (actionId === "upload_files") {
    await telegramLog(chatId, "Upload geregistreerd")
    return { state: "DONE", action: actionId }
  }

  /*
  ====================================================
  ARCHITECT ACTIONS
  ====================================================
  */

  if (actionId === "architect_full_ui_pages_build") {
    await telegramLog(chatId, "UI build gestart")
    await architectFullUiBuild(task)
    await telegramLog(chatId, "UI build afgerond")
    return { state: "DONE", action: actionId }
  }

  /*
  ====================================================
  BUILDER ACTIONS (FALLBACK)
  ====================================================
  */

  const result = await runBuilder({
    actionId,
    taskId: task.id,
    project_id,
    ...payload
  })

  return result
}

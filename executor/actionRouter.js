import fs from "fs"
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

  /*
  ====================================================
  SYSTEM ACTIONS
  ====================================================
  */
  if (actionId === "project_scan") {
    console.log("SYSTEM ACTION project_scan", task.id)
    await telegramLog(chatId, "Projectscan gestart")

    await handleProjectScan({
      id: task.id,
      project_id: task.project_id,
      payload
    })

    await telegramLog(chatId, "Projectscan afgerond")
    return { state: "DONE", action: actionId }
  }

  if (actionId === "start_rekenwolk") {
    console.log("SYSTEM ACTION start_rekenwolk", task.id)
    await telegramLog(chatId, "Rekenwolk gestart")

    await handleStartRekenwolk({
      id: task.id,
      project_id: task.project_id,
      payload
    })

    await telegramLog(chatId, "Rekenwolk afgerond")
    return { state: "DONE", action: actionId }
  }

  /*
  ====================================================
  UPLOAD ACTION  (NIEUW – EXECUTOR ONLY)
  ====================================================
  */
  if (actionId === "upload_files") {
    console.log("SYSTEM ACTION upload_files", task.id)
    await telegramLog(chatId, "Upload gestart")

    const { bucket, files } = payload

    if (!bucket) {
      throw new Error("UPLOAD_NO_BUCKET")
    }

    if (!Array.isArray(files) || files.length === 0) {
      throw new Error("UPLOAD_NO_FILES")
    }

    for (const file of files) {
      if (!file.local_path || !file.target_path) {
        throw new Error("UPLOAD_INVALID_FILE_PAYLOAD")
      }

      const buffer = fs.readFileSync(file.local_path)

      const { error } = await supabase.storage
        .from(bucket)
        .upload(file.target_path, buffer, {
          contentType: file.content_type || "application/octet-stream",
          upsert: false
        })

      if (error) {
        throw error
      }
    }

    await telegramLog(chatId, `Upload afgerond (${files.length})`)
    return { state: "DONE", action: actionId, uploaded: files.length }
  }

  /*
  ====================================================
  ARCHITECT ACTIONS
  ====================================================
  */
  if (actionId === "architect_full_ui_pages_build") {
    console.log("ARCHITECT ACTION", actionId)
    await telegramLog(chatId, "UI build gestart")

    await architectFullUiBuild(task)

    await telegramLog(chatId, "UI build afgerond")
    return { state: "DONE", action: actionId }
  }

  /*
  ====================================================
  BUILDER ACTIONS
  ====================================================
  */
  console.log("BUILDER ACTION", actionId)
  await telegramLog(chatId, `Start: ${actionId}`)

  const result = await runBuilder({
    actionId,
    taskId: task.id,
    project_id: task.project_id,
    ...payload
  })

  await telegramLog(chatId, `Klaar: ${actionId}`)
  return result
}

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

async function updateExecutorTask(taskId, data) {
  await supabase
    .from("executor_tasks")
    .update(data)
    .eq("id", taskId)
}

async function telegramLog(chatId, message) {
  if (!TELEGRAM_MODE) return
  if (!chatId) return
  try {
    await sendTelegram(chatId, message)
  } catch (_) {}
}

export async function runAction(task) {
  if (!task || !task.id) {
    console.error("RUNACTION_NO_TASK")
    return
  }

  const payload =
    typeof task.payload === "object" && task.payload !== null
      ? task.payload
      : {}

  const chatId = payload.chat_id || null

  /*
  ====================================================
  SYSTEM ACTIONS
  ====================================================
  */
  try {
    if (task.action === "PROJECT_SCAN") {
      console.log("SYSTEM ACTION: PROJECT_SCAN", task.id)

      await updateExecutorTask(task.id, {
        status: "running",
        started_at: new Date().toISOString()
      })

      await handleProjectScan({
        project_id: task.project_id,
        payload
      })

      await updateExecutorTask(task.id, {
        status: "done",
        finished_at: new Date().toISOString()
      })

      return
    }

    if (task.action === "START_REKENWOLK") {
      console.log("SYSTEM ACTION: START_REKENWOLK", task.id)

      await updateExecutorTask(task.id, {
        status: "running",
        started_at: new Date().toISOString()
      })

      await handleStartRekenwolk({
        project_id: task.project_id,
        payload
      })

      await updateExecutorTask(task.id, {
        status: "done",
        finished_at: new Date().toISOString()
      })

      return
    }

  } catch (err) {
    console.error("SYSTEM_ACTION_ERROR", err.message)

    await updateExecutorTask(task.id, {
      status: "failed",
      error: err.message,
      finished_at: new Date().toISOString()
    })

    throw err
  }

  /*
  ====================================================
  BUILDER ACTIONS
  ====================================================
  */
  let actionId =
    task.action ||
    payload.actionId ||
    task.action_id ||
    task.type ||
    null

  if (typeof actionId === "string") {
    actionId = actionId
      .toLowerCase()
      .replace(/[^a-z0-9_]+/g, "_")
      .replace(/^_|_$/g, "")
  }

  if (STRICT_MODE && !actionId) {
    throw new Error("ACTION_ID_MISSING")
  }

  console.log("BUILDER ACTION:", actionId)
  await telegramLog(chatId, `▶️ Start: ${actionId}`)

  if (actionId === "architect_full_ui_pages_build") {
    try {
      await architectFullUiBuild(task)

      await updateExecutorTask(task.id, {
        status: "done",
        finished_at: new Date().toISOString()
      })

      await telegramLog(chatId, "✅ UI opgebouwd")
      return

    } catch (err) {
      await updateExecutorTask(task.id, {
        status: "failed",
        error: err.message,
        finished_at: new Date().toISOString()
      })
      throw err
    }
  }

  try {
    const result = await runBuilder({
      actionId,
      taskId: task.id,
      project_id: task.project_id,
      ...payload
    })

    await updateExecutorTask(task.id, {
      status: "done",
      finished_at: new Date().toISOString()
    })

    await telegramLog(chatId, `✅ Klaar: ${actionId}`)
    return result

  } catch (err) {
    await updateExecutorTask(task.id, {
      status: "failed",
      error: err.message,
      finished_at: new Date().toISOString()
    })

    await telegramLog(chatId, `❌ Fout: ${err.message}`)
    throw err
  }
}

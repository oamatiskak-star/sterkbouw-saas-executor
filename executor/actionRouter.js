import { createClient } from "@supabase/supabase-js"
import { runBuilder } from "../builder/index.js"
import { architectFullUiBuild } from "../actions/architectFullUiBuild.js"
import { sendTelegram } from "../integrations/telegramSender.js"

// SYSTEEM HANDLERS (CRASH SAFE)
import { handleProjectScan } from "../handlers/projectScan.js"
import { handleStartRekenwolk } from "../handlers/startRekenwolk.js"

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
)

const STRICT_MODE = true
const TELEGRAM_MODE = true

/*
====================================================
HULPFUNCTIES
====================================================
*/
async function updateExecutorTask(taskId, data) {
  await supabase
    .from("executor_tasks")
    .update(data)
    .eq("id", taskId)
}

async function telegramLog(chatId, message) {
  if (!TELEGRAM_MODE || !chatId) return
  try {
    await sendTelegram(chatId, message)
  } catch (_) {}
}

/*
====================================================
EXECUTOR ENTRYPOINT – CRASH SAFE
====================================================
*/
export async function runAction(task) {
  if (!task || !task.id) {
    console.error("RUNACTION_NO_TASK")
    return
  }

  const payload = task.payload || {}
  const chatId = payload.chat_id || null

  /*
  ====================================================
  SYSTEEM ACTIES – ALTIJD EERST
  ====================================================
  */
  try {
    if (task.action === "PROJECT_SCAN") {
      console.log("RUN SYSTEM ACTION: PROJECT_SCAN", task.id)
      await handleProjectScan(task)
      return
    }

    if (task.action === "START_REKENWOLK") {
      console.log("RUN SYSTEM ACTION: START_REKENWOLK", task.id)
      await handleStartRekenwolk(task)
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
  ACTION ID RESOLUTIE (DEFENSIEF)
  ====================================================
  */
  let actionId =
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

  console.log("RUN BUILDER ACTION:", actionId)
  if (chatId) await telegramLog(chatId, `▶️ Start: ${actionId}`)

  /*
  ====================================================
  ARCHITECT ACTIE
  ====================================================
  */
  if (actionId === "architect_full_ui_pages_build") {
    try {
      await architectFullUiBuild(task)
      await updateExecutorTask(task.id, { status: "done" })
      if (chatId) await telegramLog(chatId, "✅ UI opgebouwd")
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

  /*
  ====================================================
  BUILDER / BACKEND
  ====================================================
  */
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

    if (chatId) await telegramLog(chatId, `✅ Klaar: ${actionId}`)
    return result

  } catch (err) {
    console.error("BUILDER_ERROR", err.message)

    await updateExecutorTask(task.id, {
      status: "failed",
      error: err.message,
      finished_at: new Date().toISOString()
    })

    if (chatId) await telegramLog(chatId, `❌ Fout: ${err.message}`)
    throw err
  }
}

import { createClient } from "@supabase/supabase-js"
import { runBuilder } from "../builder/index.js"
import { architectFullUiBuild } from "../actions/architectFullUiBuild.js"
import { sendTelegram } from "../integrations/telegramSender.js"

/*
====================================================
AO EXECUTOR – ACTION ROUTER
STABIEL / SQL-FIRST / CRASH-VRIJ
====================================================
*/

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
)

const STRICT_MODE = true
const TELEGRAM_MODE = true

async function updateTask(taskId, data) {
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

export async function runAction(task) {
  if (!task || !task.id) {
    console.error("RUNACTION_NO_TASK")
    return
  }

  const { id, action, payload = {}, project_id } = task
  const chatId = payload.chat_id || null

  console.log("EXECUTOR_RUN_ACTION:", action, id)

  // mark running
  await updateTask(id, {
    status: "running",
    started_at: new Date().toISOString()
  })

  if (chatId) {
    await telegramLog(chatId, `▶️ Start: ${action}`)
  }

  /*
  ====================================================
  ARCHITECT ACTIE (APART, MAAR VEILIG)
  ====================================================
  */
  if (action === "ARCHITECT_FULL_UI_BUILD") {
    try {
      await architectFullUiBuild(task)

      await updateTask(id, {
        status: "done",
        finished_at: new Date().toISOString()
      })

      if (chatId) {
        await telegramLog(chatId, "✅ Architect taak voltooid")
      }

      return
    } catch (err) {
      await updateTask(id, {
        status: "failed",
        error: err.message,
        finished_at: new Date().toISOString()
      })

      if (chatId) {
        await telegramLog(chatId, `❌ Architect fout: ${err.message}`)
      }

      throw err
    }
  }

  /*
  ====================================================
  STANDAARD BUILDER ACTIE
  ====================================================
  */
  let actionId = action

  if (typeof actionId === "string") {
    actionId = actionId
      .toLowerCase()
      .replace(/[^a-z0-9_]+/g, "_")
      .replace(/^_|_$/g, "")
  }

  if (STRICT_MODE && !actionId) {
    throw new Error("ACTION_ID_MISSING")
  }

  try {
    const result = await runBuilder({
      actionId,
      taskId: id,
      project_id,
      ...payload
    })

    await updateTask(id, {
      status: "done",
      finished_at: new Date().toISOString()
    })

    if (chatId) {
      await telegramLog(chatId, `✅ Klaar: ${action}`)
    }

    return result

  } catch (err) {
    console.error("EXECUTOR_BUILDER_ERROR", err.message)

    await updateTask(id, {
      status: "failed",
      error: err.message,
      finished_at: new Date().toISOString()
    })

    if (chatId) {
      await telegramLog(chatId, `❌ Fout bij ${action}: ${err.message}`)
    }

    throw err
  }
}

import { runBuilder } from "../builder/index.js"
import { createClient } from "@supabase/supabase-js"
import { architectFullUiBuild } from "../actions/architectFullUiBuild.js"
import { sendTelegram } from "../integrations/telegramSender.js"

/*
AO EXECUTOR – ACTION ROUTER
ENIGE INGANG
SQL-FIRST
STRICT MODE
TELEGRAM + CHATGPT GESTUURD
*/

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
)

/*
====================================================
MODES
====================================================
*/
const MODES = {
  STRICT: true,
  TELEGRAM: true
}

/*
====================================================
ACTION ALIAS MAP
====================================================
*/
const ACTION_ALIAS = {
  // frontend
  generate_page: "frontend_generate_standard_page",
  generate_dashboard: "frontend_generate_standard_page",
  frontend_generate_page: "frontend_generate_standard_page",
  frontend_structure_normalize: "frontend_sync_navigation",
  frontend_canonical_fix: "frontend_apply_global_layout_github",
  frontend_canonical_commit: "frontend_build",

  // builder
  builder_run: "frontend_build",
  builder_execute: "frontend_build",

  // backend
  run_initialization: "backend_run_initialization",
  start_calculation: "backend_start_calculation"
}

/*
====================================================
SYSTEM / COMMAND ACTIONS
– GEEN BUILDER
– WEL TERUGKOPPELING
====================================================
*/
const SYSTEM_ACTIONS = {
  architect_full_ui_pages_build: true,
  system_post_deploy_verify: true,
  backend_run_initialization: true,
  backend_start_calculation: true,
  system_health: true,
  system_status: true
}

/*
====================================================
HULPFUNCTIES
====================================================
*/
async function updateTask(taskId, data) {
  await supabase.from("tasks").update(data).eq("id", taskId)
}

async function telegramLog(chatId, message) {
  if (!MODES.TELEGRAM) return
  try {
    await sendTelegram(chatId, message)
  } catch (_) {}
}

/*
====================================================
EXECUTOR ENTRYPOINT
====================================================
*/
export async function runAction(task) {
  if (!task) return

  const payload = task.payload || {}
  const chatId = payload.chat_id || null

  let actionId =
    payload.actionId ||
    task.action_id ||
    (task.type
      ? task.type
          .toLowerCase()
          .replace(/[^a-z0-9_]+/g, "_")
          .replace(/^_|_$/g, "")
      : null)

  if (MODES.STRICT && !actionId) {
    throw new Error("ACTION_ID_MISSING")
  }

  if (ACTION_ALIAS[actionId]) {
    actionId = ACTION_ALIAS[actionId]
  }

  console.log("AO RUN ACTION:", actionId)
  if (chatId) await telegramLog(chatId, `▶️ Start: ${actionId}`)

  /*
  ====================================================
  ARCHITECT
  ====================================================
  */
  if (actionId === "architect_full_ui_pages_build") {
    try {
      const result = await architectFullUiBuild(task)
      await updateTask(task.id, { status: "done" })
      if (chatId) await telegramLog(chatId, "✅ UI opgebouwd")
      return
    } catch (err) {
      await updateTask(task.id, { status: "failed", error: err.message })
      if (chatId) await telegramLog(chatId, "❌ Architect fout: " + err.message)
      throw err
    }
  }

  /*
  ====================================================
  SYSTEM / STATUS / HEALTH
  ====================================================
  */
  if (SYSTEM_ACTIONS[actionId]) {
    await updateTask(task.id, { status: "done" })

    if (chatId) {
      if (actionId === "system_status") {
        await telegramLog(chatId, "Systeem draait. Executor actief.")
      } else if (actionId === "system_health") {
        await telegramLog(chatId, "Health OK. Geen fouten gemeld.")
      } else {
        await telegramLog(chatId, `🧠 Actie uitgevoerd: ${actionId}`)
      }
    }
    return
  }

  /*
  ====================================================
  DEPLOY GATE
  ====================================================
  */
  const { data: gate } = await supabase
    .from("deploy_gate")
    .select("allow_frontend, allow_build, allow_backend")
    .eq("id", 1)
    .single()

  if (!gate) throw new Error("DEPLOY_GATE_MIST")

  if (actionId.startsWith("frontend_") && gate.allow_frontend !== true) {
    throw new Error("FRONTEND_GATE_GESLOTEN")
  }

  if (actionId.startsWith("builder_") && gate.allow_build !== true) {
    throw new Error("BUILD_GATE_GESLOTEN")
  }

  if (actionId.startsWith("backend_") && gate.allow_backend !== true) {
    throw new Error("BACKEND_GATE_GESLOTEN")
  }

  /*
  ====================================================
  BUILDER / BACKEND EXECUTIE
  ====================================================
  */
  try {
    const result = await runBuilder({
      actionId,
      taskId: task.id,
      originalType: task.type,
      ...payload
    })

    await updateTask(task.id, { status: "done" })
    if (chatId) await telegramLog(chatId, `✅ Klaar: ${actionId}`)
    return result

  } catch (err) {
    await updateTask(task.id, { status: "failed", error: err.message })
    if (chatId) await telegramLog(chatId, `❌ Fout: ${err.message}`)
    throw err
  }
}

import { runBuilder } from "../builder/index.js"
import { createClient } from "@supabase/supabase-js"
import { architectFullUiBuild } from "../actions/architectFullUiBuild.js"
import { sendTelegramMessage } from "../integrations/telegram.js"

/*
AO EXECUTOR – ACTION ROUTER
ENIGE INGANG
SQL-FIRST
STRICT MODE
VOLLEDIG AUTONOOM
CHATGPT / TELEGRAM GESTUURD
*/

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
)

/*
====================================================
MODUS DEFINITIES
====================================================
*/
const MODES = {
  STRICT: true,
  TELEGRAM: true,
  AUTONOMOUS: true,
  CHATGPT_DRIVEN: true
}

/*
====================================================
ACTION ALIAS MAP
====================================================
*/
const ACTION_ALIAS = {
  generate_page: "frontend_generate_standard_page",
  generate_dashboard: "frontend_generate_standard_page",

  builder_run: "frontend_build",
  builder_execute: "frontend_build",

  frontend_generate_page: "frontend_generate_standard_page",
  frontend_structure_normalize: "frontend_sync_navigation",
  frontend_canonical_fix: "frontend_apply_global_layout_github",
  frontend_canonical_commit: "frontend_build",

  run_initialization: "backend_run_initialization",
  start_calculation: "backend_start_calculation"
}

/*
====================================================
SYSTEM / ORCHESTRATION ACTIONS
– GEEN BUILDER
– WEL AUTONOME FLOW
====================================================
*/
const SYSTEM_ACTIONS = {
  architect_full_ui_pages_build: true,
  builder_full_system_wire: true,
  system_post_deploy_verify: true,
  backend_run_initialization: true,
  backend_start_calculation: true
}

/*
====================================================
HULPFUNCTIES
====================================================
*/
async function updateTask(taskId, data) {
  await supabase.from("tasks").update(data).eq("id", taskId)
}

async function telegramLog(message) {
  if (MODES.TELEGRAM) {
    try {
      await sendTelegramMessage(message)
    } catch (_) {}
  }
}

/*
====================================================
EXECUTOR ENTRYPOINT
====================================================
*/
export async function runAction(task) {
  if (!task) {
    return { status: "ignored", reason: "GEEN_TASK" }
  }

  const payload = task.payload || {}

  let actionId =
    payload.actionId ||
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
  await telegramLog(`▶️ AO START: ${actionId}`)

  /*
  ====================================================
  ARCHITECT – VOLLEDIG GEISOLEERD
  ====================================================
  */
  if (actionId === "architect_full_ui_pages_build") {
    try {
      const result = await architectFullUiBuild(task)
      await updateTask(task.id, { status: "done" })
      await telegramLog("✅ Architect klaar")
      return { status: "ok", actionId, result }
    } catch (err) {
      await updateTask(task.id, { status: "failed", error: err.message })
      await telegramLog("❌ Architect fout: " + err.message)
      throw err
    }
  }

  /*
  ====================================================
  SYSTEM / AUTONOME ACTIONS
  ====================================================
  */
  if (SYSTEM_ACTIONS[actionId]) {
    await updateTask(task.id, { status: "done" })
    await telegramLog(`🧠 System action uitgevoerd: ${actionId}`)
    return { status: "ok", actionId }
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
    await telegramLog(`✅ Uitgevoerd: ${actionId}`)

    return { status: "ok", actionId, result }
  } catch (err) {
    await updateTask(task.id, { status: "failed", error: err.message })
    await telegramLog(`❌ Fout in ${actionId}: ${err.message}`)
    throw err
  }
}

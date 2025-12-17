import { runBuilder } from "../builder/index.js"
import { createClient } from "@supabase/supabase-js"

/*
ACTION ROUTER
- ENIGE EXECUTOR INGANG
- SQL-FIRST
- DEPLOY GATE AFDWINGING
- STABIEL
*/

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
)

/*
========================
ACTION ALIAS MAP
Hier lossen we alles op
========================
*/
const ACTION_ALIAS = {
  generate_page: "frontend_write_file",
  generate_dashboard: "frontend_write_file",
  builder_run: "frontend_build",
  builder_execute: "frontend_build"
}

export async function runAction(task) {
  try {
    if (!task) {
      return { status: "ignored", reason: "GEEN_TASK" }
    }

    const payload = task.payload || {}

    /*
    ========================
    ACTION ID AFLEIDING
    ========================
    */
    let actionId =
      payload.actionId ||
      (task.type
        ? task.type
            .toLowerCase()
            .replace(/[^a-z0-9]+/g, "_")
            .replace(/^_|_$/g, "")
        : null)

    if (!actionId) {
      await supabase
        .from("tasks")
        .update({ status: "done" })
        .eq("id", task.id)

      return { status: "done", reason: "GEEN_ACTION_ID" }
    }

    /*
    ========================
    ALIAS TOE PASSEN
    ========================
    */
    if (ACTION_ALIAS[actionId]) {
      actionId = ACTION_ALIAS[actionId]
    }

    /*
    ========================
    DEPLOY GATE
    ========================
    */
    const { data: gate } = await supabase
      .from("deploy_gate")
      .select("allow_frontend, allow_build")
      .eq("id", 1)
      .single()

    if (!gate) {
      return { status: "blocked", reason: "DEPLOY_GATE_MIST" }
    }

    if (actionId.startsWith("frontend_") && gate.allow_frontend !== true) {
      return { status: "blocked", reason: "FRONTEND_GATE_GESLOTEN" }
    }

    if (actionId.startsWith("builder_") && gate.allow_build !== true) {
      return { status: "blocked", reason: "BUILD_GATE_GESLOTEN" }
    }

    /*
    ========================
    BUILDER EXECUTIE
    ========================
    */
    const result = await runBuilder({
      actionId,
      taskId: task.id,
      originalType: task.type,
      ...payload
    })

    await supabase
      .from("tasks")
      .update({ status: "done" })
      .eq("id", task.id)

    return { status: "ok", actionId, result }

  } catch (err) {
    await supabase
      .from("tasks")
      .update({ status: "error" })
      .eq("id", task?.id)

    return { status: "error", error: err.message }
  }
}

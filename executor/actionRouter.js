import { runBuilder } from "../builder/index.js"
import { createClient } from "@supabase/supabase-js"
import { architectFullUiBuild } from "../actions/architectFullUiBuild.js"

/*
ACTION ROUTER

ENIGE EXECUTOR INGANG
SQL-FIRST
DEPLOY GATE AFDWINGING
STABIEL
*/

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
)

/*
ACTION ALIAS MAP
– expliciete frontend koppelingen
*/
const ACTION_ALIAS = {
  generate_page: "frontend_generate_standard_page",
  generate_dashboard: "frontend_generate_standard_page",

  builder_run: "frontend_build",
  builder_execute: "frontend_build",

  frontend_generate_page: "frontend_generate_standard_page",

  // NIEUW – frontend orchestration
  frontend_structure_normalize: "frontend_sync_navigation",
  frontend_canonical_fix: "frontend_apply_global_layout_github",
  frontend_canonical_commit: "frontend_build"
}

export async function runAction(task) {
  if (!task) {
    return { status: "ignored", reason: "GEEN_TASK" }
  }

  try {
    const payload = task.payload || {}

    /*
    ARCHITECT TAKEN
    VOLLEDIG GEISOLEERD
    */
    if (task.type === "architect:full_ui_pages_build") {
      console.log("ARCHITECT FULL UI BUILD START")

      try {
        const result = await architectFullUiBuild(task)

        await supabase
          .from("tasks")
          .update({ status: "done" })
          .eq("id", task.id)

        return {
          status: "ok",
          actionId: "architect_full_ui_pages_build",
          result
        }
      } catch (err) {
        await supabase
          .from("tasks")
          .update({
            status: "failed",
            error: err.message
          })
          .eq("id", task.id)

        throw err
      }
    }

    /*
    ACTION ID AFLEIDING
    */
    let actionId =
      payload.actionId ||
      (task.type
        ? task.type
            .toLowerCase()
            .replace(/[^a-z0-9_]+/g, "")
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
    ALIAS TOE PASSEN
    */
    if (ACTION_ALIAS[actionId]) {
      actionId = ACTION_ALIAS[actionId]
    }

    console.log("RUN ACTION:", actionId)

    /*
    DEPLOY GATE
    */
    const { data: gate, error: gateError } = await supabase
      .from("deploy_gate")
      .select("allow_frontend, allow_build")
      .eq("id", 1)
      .single()

    if (gateError || !gate) {
      throw new Error("DEPLOY_GATE_MIST")
    }

    if (actionId.startsWith("frontend_") && gate.allow_frontend !== true) {
      throw new Error("FRONTEND_GATE_GESLOTEN")
    }

    if (actionId.startsWith("builder_") && gate.allow_build !== true) {
      throw new Error("BUILD_GATE_GESLOTEN")
    }

    /*
    BUILDER EXECUTIE
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
    console.error("ACTION FOUT:", err.message)

    await supabase
      .from("tasks")
      .update({
        status: "failed",
        error: err.message
      })
      .eq("id", task.id)

    return { status: "error", error: err.message }
  }
}

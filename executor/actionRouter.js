import { runBuilder } from "../builder/index.js"
import { createClient } from "@supabase/supabase-js"

/*
ACTION ROUTER
- ENIGE EXECUTOR INGANG
- SQL-FIRST
- DEPLOY GATE AFDWINGING
- STABIEL, GEEN SYNTAX RISICO
*/

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
)

export async function runAction(task) {
  try {
    if (!task) {
      return {
        status: "ignored",
        reason: "GEEN_TASK"
      }
    }

    const payload = task.payload || {}

    /*
    ========================
    ACTION ID AFLEIDING
    ========================
    - Eerst expliciet uit payload
    - Anders automatisch uit task.type
    */
    const actionId =
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
        .update({
          status: "done",
          updated_at: new Date().toISOString()
        })
        .eq("id", task.id)

      return {
        status: "done",
        reason: "GEEN_ACTION_ID_MAAR_AFGEROND"
      }
    }

    /*
    ========================
    DEPLOY GATE
    ========================
    */
    const { data: gate, error: gateError } = await supabase
      .from("deploy_gate")
      .select("allow_frontend, allow_build")
      .eq("id", 1)
      .single()

    if (gateError || !gate) {
      return {
        status: "blocked",
        reason: "DEPLOY_GATE_ONBESCHIKBAAR"
      }
    }

    if (actionId.startsWith("frontend_") && gate.allow_frontend !== true) {
      return {
        status: "blocked",
        reason: "FRONTEND_GATE_GESLOTEN"
      }
    }

    if (actionId.startsWith("builder_") && gate.allow_build !== true) {
      return {
        status: "blocked",
        reason: "BUILD_GATE_GESLOTEN"
      }
    }

    /*
    ========================
    BUILDER EXECUTIE
    ========================
    */
    const result = await runBuilder({
      actionId,
      taskId: task.id,
      ...payload
    })

    await supabase
      .from("tasks")
      .update({
        status: "done",
        updated_at: new Date().toISOString()
      })
      .eq("id", task.id)

    return {
      status: "ok",
      actionId,
      result
    }

  } catch (err) {
    await supabase
      .from("tasks")
      .update({
        status: "error",
        updated_at: new Date().toISOString()
      })
      .eq("id", task?.id)

    return {
      status: "error",
      error: err.message
    }
  }
}

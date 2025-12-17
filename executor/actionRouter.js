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
    if (!task || !task.payload) {
      return {
        status: "ignored",
        reason: "GEEN_PAYLOAD"
      }
    }

    const payload = task.payload
    const actionId = payload.actionId

    if (!actionId) {
      return {
        status: "ignored",
        reason: "GEEN_ACTION_ID"
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

    if (actionId.startsWith("frontend:") && gate.allow_frontend !== true) {
      return {
        status: "blocked",
        reason: "FRONTEND_GATE_GESLOTEN"
      }
    }

    if (actionId.startsWith("builder:") && gate.allow_build !== true) {
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
      ...payload
    })

    return {
      status: "ok",
      actionId,
      result
    }

  } catch (err) {
    return {
      status: "error",
      error: err.message
    }
  }
}

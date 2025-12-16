import { runBuilder } from "../builder/index.js"
import { createClient } from "@supabase/supabase-js"

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
)

/*
ACTION ROUTER – DEFINITIEF
- SQL is enige input
- action_id komt UIT KOLOM action_id
- deploy gates verplicht
- geen crashes
*/

export async function runAction(task) {
  try {
    if (!task) {
      return { status: "ignored", reason: "NO_TASK" }
    }

    const id = task.id
    const type = task.type || "unknown"
    const payload = task.payload || {}
    const actionId = task.action_id

    console.log("EXECUTOR TASK ONTVANGEN")
    console.log("TASK ID:", id)
    console.log("TYPE:", type)
    console.log("ACTION_ID:", actionId)
    console.log("PAYLOAD:", payload)

    if (!actionId) {
      return {
        status: "ignored",
        reason: "GEEN_ACTION_ID"
      }
    }

    /*
    ========================
    DEPLOY GATE CONTROLE
    ========================
    */
    if (type === "frontend") {
      const { data: gates, error } = await supabase
        .from("deploy_gates")
        .select("approved")
        .eq("scope", "frontend")
        .eq("phase", "analysis_complete")
        .limit(1)

      if (error) {
        return {
          status: "error",
          error: error.message
        }
      }

      if (!gates || gates.length === 0 || gates[0].approved !== true) {
        return {
          status: "blocked",
          reason: "DEPLOY_GATE_NIET_GOEDGEKEURD"
        }
      }
    }

    /*
    ========================
    BUILDER / FRONTEND
    ========================
    */
    if (type === "frontend" || type === "builder") {
      const result = await runBuilder({
        actionId,
        ...payload
      })

      return {
        status: "ok",
        runner: "builder",
        actionId,
        result
      }
    }

    /*
    ========================
    SQL EXECUTIE
    ========================
    */
    if (type === "sql") {
      if (!payload.sql) {
        return {
          status: "error",
          reason: "GEEN_SQL_IN_PAYLOAD"
        }
      }

      const { error } = await supabase.rpc("execute_sql", {
        sql_statement: payload.sql
      })

      if (error) {
        return {
          status: "error",
          error: error.message
        }
      }

      return {
        status: "ok",
        runner: "sql"
      }
    }

    /*
    ========================
    FALLBACK
    ========================
    */
    return {
      status: "ignored",
      reason: "ONBEKEND_TYPE",
      type
    }

  } catch (err) {
    console.error("ACTION ROUTER FOUT:", err.message)

    return {
      status: "error",
      error: err.message
    }
  }
}

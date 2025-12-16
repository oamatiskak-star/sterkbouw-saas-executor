import { runBuilder } from "../builder/index.js"
import { createClient } from "@supabase/supabase-js"

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
)

export async function runAction(task) {
  try {
    if (!task) {
      return {
        status: "ignored",
        reason: "GEEN_TASK_OBJECT"
      }
    }

    const type = task.type || "unknown"
    const actionId = task.action_id
    const payload = task.payload || {}

    console.log("EXECUTOR TASK ONTVANGEN")
    console.log("TYPE:", type)
    console.log("ACTION_ID:", actionId)
    console.log("PAYLOAD:", payload)

    if (!actionId) {
      return {
        status: "ignored",
        reason: "GEEN_ACTION_ID_OP_TASK"
      }
    }

    /*
    ========================
    FRONTEND / BUILDER
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
    SQL
    ========================
    */
    if (type === "sql") {
      const sql = payload.sql

      if (!sql) {
        return {
          status: "error",
          error: "GEEN_SQL_IN_PAYLOAD"
        }
      }

      const { error } = await supabase.rpc("execute_sql", {
        sql_statement: sql
      })

      if (error) {
        return {
          status: "error",
          error: error.message
        }
      }

      return {
        status: "ok",
        runner: "sql",
        executed: true
      }
    }

    /*
    ========================
    ONBEKEND
    ========================
    */
    return {
      status: "ignored",
      reason: "ONBEKEND_TASK_TYPE",
      type
    }

  } catch (err) {
    return {
      status: "error",
      error: err.message
    }
  }
}

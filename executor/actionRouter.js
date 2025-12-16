// executor/actionRouter.js

/*
ACTION ROUTER
- CENTRALE DISPATCHER VOOR EXECUTOR
- ONTVANGT TAKEN UIT SUPABASE
- ROUTET NAAR BUILDER OF SQL
- GEEN STATISCHE IMPORTS
- MAG NOOIT CRASHEN
*/

import { runBuilder } from "../builder/index.js"
import { createClient } from "@supabase/supabase-js"

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
)

export async function runAction(task) {
  const { action, payload } = task

  try {
    // BUILDER ACTIONS
    if (action.startsWith("builder:") || action.startsWith("frontend:")) {
      const result = await runBuilder({
        actionId: action,
        ...payload
      })

      return {
        status: "ok",
        runner: "builder",
        action,
        result
      }
    }

    // SQL ACTIONS
    if (action === "sql:execute") {
      const { sql } = payload

      if (!sql) {
        return {
          status: "error",
          error: "GEEN_SQL_MEEGEGEVEN"
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

    // UI STATE ACTIONS
    if (action === "ui:update_state") {
      const { table, data } = payload

      const { error } = await supabase
        .from(table)
        .insert(data)

      if (error) {
        return {
          status: "error",
          error: error.message
        }
      }

      return {
        status: "ok",
        runner: "ui",
        table
      }
    }

    // ONBEKEND
    return {
      status: "ignored",
      message: "Onbekende action",
      action
    }

  } catch (err) {
    return {
      status: "error",
      action,
      error: err.message
    }
  }
}

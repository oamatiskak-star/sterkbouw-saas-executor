/*
ACTION ROUTER
- CENTRALE DISPATCHER VOOR EXECUTOR
- LEEST TAKEN UIT SUPABASE
- GEBRUIKT type + action_id (NIET action)
- ROUTET NAAR BUILDER OF SQL
- MAG NOOIT CRASHEN
*/

import { runBuilder } from "../builder/index.js"
import { createClient } from "@supabase/supabase-js"

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
)

export async function runAction(task) {
  const { type, action_id, payload } = task

  try {
    /*
    ========================
    FRONTEND + BUILDER
    ========================
    */
    if (type === "frontend") {
      const result = await runBuilder({
        actionId: action_id || "frontend:apply_global_layout",
        ...payload
      })

      return {
        status: "ok",
        runner: "builder",
        type,
        action_id,
        result
      }
    }

    if (type === "builder") {
      const result = await runBuilder({
        actionId: action_id,
        ...payload
      })

      return {
        status: "ok",
        runner: "builder",
        type,
        action_id,
        result
      }
    }

    /*
    ========================
    SQL EXECUTIE
    ========================
    */
    if (type === "sql") {
      const { sql } = payload || {}

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

    /*
    ========================
    UI STATE
    ========================
    */
    if (type === "ui") {
      const { table, data } = payload || {}

      if (!table || !data) {
        return {
          status: "error",
          error: "UI_PAYLOAD_ONGELDIG"
        }
      }

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

    /*
    ========================
    ONBEKEND
    ========================
    */
    return {
      status: "ignored",
      message: "Onbekend task type",
      type,
      action_id
    }

  } catch (err) {
    return {
      status: "error",
      type,
      action_id,
      error: err.message
    }
  }
}

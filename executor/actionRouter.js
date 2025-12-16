/*
ACTION ROUTER – DEFINITIEF
- LEEST TAKEN UIT SUPABASE
- GEBRUIKT UITSLUITEND payload.action_id
- ONGEVOELIG VOOR RLS / PARTIAL ROWS
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
  try {
    const payload = task?.payload || {}
    const type = task?.type || "unknown"
    const actionId = payload.action_id

    console.log("EXECUTOR TASK ONTVANGEN")
    console.log("TYPE:", type)
    console.log("ACTION_ID:", actionId)

    // HARD STOP ALS GEEN ACTIE
    if (!actionId) {
      return {
        status: "ignored",
        reason: "GEEN_ACTION_ID_IN_PAYLOAD",
        task
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
    SQL EXECUTIE
    ========================
    */
    if (type === "sql") {
      const { sql } = payload

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
    ONBEKEND TYPE

import { runBuilder } from "../builder/index.js"
import { createClient } from "@supabase/supabase-js"

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
)

/*
ACTION ROUTER – DEFINITIEF
- SQL is enige input
- action_id komt uit kolom action_id
- deploy gates verplicht
- geen crashes
*/

export async function runAction(task) {
  try {
    if (!task) {
      return { status: "ignored", reason: "NO_TASK" }
    }

    const {
      id,
      type = "unknown",
      payload = {},
      action_id
    } = task

    console.log("EXECUTOR TASK ONTVANGEN")
    console.log("TASK ID:", id)
    console.log("TYPE:", type)
    console.log("ACTION_ID:", action_id)
    console.log("PAYLOAD:", payload)

    if (!action_id) {
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
      const { data: gates } = await supabase
        .from("deploy_gates")
        .select("approved")
        .eq("scope", "frontend")
        .eq("phase", "analysis_complete")
        .limit(1)

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
        actionId: action_id,
        ...payload
      })

      return {
        status: "ok",
        runner: "builder",
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

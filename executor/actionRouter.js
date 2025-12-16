import { runBuilder } from "../builder/index.js"
import { createClient } from "@supabase/supabase-js"

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
)

export async function runAction(task) {
  const type = task?.type
  const payload = task?.payload || {}
  const metadata = task?.metadata || {}

  const actionId =
    task?.action_id ||
    metadata?.action_id ||
    payload?.action_id ||
    `${type}:default`

  console.log("EXECUTOR TASK OPGEPIKT:", actionId)

  try {
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

    if (type === "sql") {
      const { sql } = payload
      if (!sql) throw new Error("GEEN_SQL_MEEGEGEVEN")

      const { error } = await supabase.rpc("execute_sql", {
        sql_statement: sql
      })

      if (error) throw error

      return {
        status: "ok",
        runner: "sql"
      }
    }

    return {
      status: "ignored",
      reason: "onbekend type",
      type,
      actionId
    }

  } catch (err) {
    return {
      status: "error",
      actionId,
      error: err.message
    }
  }
}

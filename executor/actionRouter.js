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
    console.log("PAYLOAD:", payload)

    if (!actionId) {
      return { status: "ignored", reason: "GEEN_ACTION_ID" }
    }

    if (type === "frontend" || type === "builder") {
      return await runBuilder({ actionId, ...payload })
    }

    if (type === "sql") {
      const { sql } = payload
      if (!sql) return { status: "error", error: "GEEN_SQL" }

      const { error } = await supabase.rpc("execute_sql", {
        sql_statement: sql
      })

      if (error) return { status: "error", error: error.message }
      return { status: "ok", runner: "sql" }
    }

    return { status: "ignored", reason: "ONBEKEND_TYPE" }

  } catch (err) {
    return { status: "error", error: err.message }
  }
}

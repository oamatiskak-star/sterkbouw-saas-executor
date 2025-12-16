export async function runAction(task) {
  const {
    type,
    action_id,
    payload
  } = task

  const effectiveAction = action_id || type

  console.log("EXECUTOR TASK OPGEPIKT:", effectiveAction)

  try {
    if (type === "frontend" || type === "builder") {
      const result = await runBuilder({
        actionId: effectiveAction,
        ...(payload || {})
      })

      return {
        status: "ok",
        runner: "builder",
        actionId: effectiveAction,
        result
      }
    }

    if (type === "sql") {
      const { sql } = payload || {}
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
      action_id
    }

  } catch (err) {
    return {
      status: "error",
      actionId: effectiveAction,
      error: err.message
    }
  }
}

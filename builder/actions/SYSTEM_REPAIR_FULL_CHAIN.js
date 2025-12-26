export default async function SYSTEM_REPAIR_FULL_CHAIN({ supabase, task }) {
  const errors = []

  // 1. Database connectiviteit
  const ping = await supabase.from("projects").select("id").limit(1)
  if (ping.error) {
    errors.push(`DB_PROJECTS_UNREACHABLE: ${ping.error.message}`)
  }

  const pingTasks = await supabase.from("executor_tasks").select("id").limit(1)
  if (pingTasks.error) {
    errors.push(`DB_EXECUTOR_TASKS_UNREACHABLE: ${pingTasks.error.message}`)
  }

  // 2. Projectcontext (indien aanwezig)
  if (task.project_id) {
    const projectCheck = await supabase
      .from("projects")
      .select("id")
      .eq("id", task.project_id)
      .single()

    if (projectCheck.error || !projectCheck.data) {
      errors.push("PROJECT_CONTEXT_INVALID")
    }
  }

  // 3. Resultaat vastleggen (altijd)
  await supabase.from("system_log").insert({
    type: "system_repair",
    message:
      errors.length === 0
        ? "SYSTEM_REPAIR_FULL_CHAIN_OK"
        : `SYSTEM_REPAIR_WARNINGS: ${errors.join(" | ")}`
  })

  // 4. Eindoordeel
  if (errors.length > 0) {
    return {
      status: "failed",
      error: errors.join(" | ")
    }
  }

  return {
    status: "completed",
    error: null
  }
}

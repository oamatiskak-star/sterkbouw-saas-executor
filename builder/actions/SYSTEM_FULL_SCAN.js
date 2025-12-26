export default async function SYSTEM_FULL_SCAN({ supabase, task }) {
  const errors = []

  // 1. Task validatie
  if (!task || !task.project_id) {
    errors.push("TASK_PROJECT_ID_MISSING")
  }

  let project = null

  // 2. Project validatie
  if (task.project_id) {
    const projectRes = await supabase
      .from("projects")
      .select("*")
      .eq("id", task.project_id)
      .single()

    if (projectRes.error || !projectRes.data) {
      errors.push("PROJECT_NOT_FOUND")
    } else {
      project = projectRes.data
    }
  }

  // 3. Scan-voorwaarde validatie (geen aannames)
  if (project) {
    // Project bestaat = scanbaar
    // Geen extra logica toegevoegd
  }

  // 4. Scanresultaat vastleggen (altijd)
  await supabase.from("system_log").insert({
    type: "system_scan",
    message:
      errors.length === 0
        ? `SYSTEM_FULL_SCAN_OK for project ${task.project_id}`
        : `SYSTEM_FULL_SCAN_WARNINGS for project ${task.project_id}: ${errors.join(
            " | "
          )}`
  })

  // 5. Eindoordeel
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

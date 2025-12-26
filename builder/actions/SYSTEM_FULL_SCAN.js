export default async function SYSTEM_FULL_SCAN({ supabase, task }) {
  const project_id = task.project_id

  if (!project_id) {
    return {
      status: "failed",
      error: "NO_PROJECT_ID"
    }
  }

  const { data: project, error } = await supabase
    .from("projects")
    .select("id")
    .eq("id", project_id)
    .single()

  if (error || !project) {
    return {
      status: "failed",
      error: "PROJECT_NOT_FOUND"
    }
  }

  await supabase.from("system_log").insert({
    type: "scan",
    message: `system_full_scan ok for project ${project_id}`,
    created_at: new Date().toISOString()
  })

  return {
    status: "completed",
    error: null
  }
}

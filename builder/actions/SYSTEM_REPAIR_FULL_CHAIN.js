import { createClient } from "@supabase/supabase-js"

export default async function SYSTEM_FULL_SCAN(task = {}) {
  const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  )

  try {
    const project_id = task.project_id

    if (!project_id) {
      return {
        status: "failed",
        error: "NO_PROJECT_ID_IN_TASK"
      }
    }

    const { data, error } = await supabase
      .from("projects")
      .select("id")
      .eq("id", project_id)
      .single()

    if (error || !data) {
      return {
        status: "failed",
        error: "PROJECT_NOT_FOUND"
      }
    }

    await supabase.from("system_log").insert({
      type: "system_scan",
      message: `SYSTEM_FULL_SCAN_OK for ${project_id}`
    })

    return {
      status: "completed",
      error: null
    }
  } catch (e) {
    return {
      status: "failed",
      error: `SYSTEM_FULL_SCAN_EXCEPTION: ${e.message}`
    }
  }
}

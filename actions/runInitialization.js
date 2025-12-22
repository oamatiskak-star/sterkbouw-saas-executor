import { createClient } from "@supabase/supabase-js"

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
)

function normalize(action) {
  return String(action)
    .toLowerCase()
    .replace(/[^a-z0-9_]+/g, "_")
    .replace(/^_|_$/g, "")
}

export async function runInitialization({ project_id }) {
  if (!project_id) {
    throw new Error("PROJECT_ID_MISSING")
  }

  const action = normalize("project_scan")

  const { error } = await supabase
    .from("executor_tasks")
    .insert({
      project_id,
      action,
      payload: { project_id },
      status: "open",
      assigned_to: "executor"
    })

  if (error) {
    throw new Error("INIT_PROJECT_SCAN_FAILED: " + error.message)
  }

  return {
    state: "QUEUED",
    project_id,
    action
  }
}

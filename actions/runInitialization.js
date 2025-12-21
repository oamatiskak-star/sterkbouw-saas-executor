import { createClient } from "@supabase/supabase-js"

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
)

export async function runInitialization({ project_id }) {
  if (!project_id) {
    throw new Error("PROJECT_ID_MISSING")
  }

  // 1. ALLEEN project scan starten
  const { error } = await supabase
    .from("executor_tasks")
    .insert({
      project_id,
      action: "PROJECT_SCAN",
      status: "open",
      assigned_to: "executor",
      payload: {}
    })

  if (error) {
    throw new Error("INIT_PROJECT_SCAN_FAILED: " + error.message)
  }

  return { ok: true }
}

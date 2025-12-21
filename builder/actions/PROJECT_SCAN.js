import { createClient } from "@supabase/supabase-js"

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
)

export default async function projectScan(payload = {}) {
  const { project_id } = payload

  if (!project_id) {
    throw new Error("PROJECT_SCAN_MISSING_PROJECT_ID")
  }

  const { error } = await supabase
    .from("project_scan_results")
    .insert({
      project_id,
      result: "scan_ok",
      created_at: new Date().toISOString()
    })

  if (error) {
    throw new Error("PROJECT_SCAN_INSERT_FAILED: " + error.message)
  }

  return {
    state: "DONE",
    project_id
  }
}

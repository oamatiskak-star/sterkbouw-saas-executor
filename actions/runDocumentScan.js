import { createClient } from "@supabase/supabase-js"

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
)

export async function runDocumentScan({ project_id }) {
  if (!project_id) {
    throw new Error("DOCUMENT_SCAN_PROJECT_ID_MISSING")
  }

  const { error } = await supabase
    .from("executor_tasks")
    .insert({
      project_id,
      action: "DOCUMENT_SCAN",
      status: "open",
      assigned_to: "executor"
    })

  if (error) {
    throw error
  }

  return { ok: true }
}

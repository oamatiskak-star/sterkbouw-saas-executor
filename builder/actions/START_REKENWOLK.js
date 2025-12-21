import { createClient } from "@supabase/supabase-js"

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
)

export default async function startRekenwolk(payload = {}) {
  const { project_id } = payload

  if (!project_id) {
    throw new Error("START_REKENWOLK_MISSING_PROJECT_ID")
  }

  const { error } = await supabase
    .from("rekenwolk_results")
    .insert({
      project_id,
      status: "started",
      created_at: new Date().toISOString()
    })

  if (error) {
    throw new Error("START_REKENWOLK_INSERT_FAILED: " + error.message)
  }

  return {
    state: "DONE",
    project_id
  }
}

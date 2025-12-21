import { createClient } from "@supabase/supabase-js"

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
)

/*
========================
GENERATE STABU
========================
- placeholder generator
- builder-contract compliant
- hard falen bij fouten
*/

export default async function generateStabu(payload = {}) {
  const { project_id } = payload

  if (!project_id) {
    throw new Error("GENERATE_STABU_MISSING_PROJECT_ID")
  }

  const { error } = await supabase
    .from("stabu_results")
    .insert({
      project_id,
      status: "generated",
      created_at: new Date().toISOString()
    })

  if (error) {
    throw new Error("GENERATE_STABU_INSERT_FAILED: " + error.message)
  }

  return {
    state: "DONE",
    project_id
  }
}

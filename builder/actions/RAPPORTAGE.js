import { createClient } from "@supabase/supabase-js"

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
)

/*
========================
RAPPORTAGE
========================
- placeholder rapportgenerator
- builder-contract compliant
- hard falen bij fouten
*/

export default async function rapportage(payload = {}) {
  const { project_id } = payload

  if (!project_id) {
    throw new Error("RAPPORTAGE_MISSING_PROJECT_ID")
  }

  const { error } = await supabase
    .from("rapportage_results")
    .insert({
      project_id,
      status: "ready",
      created_at: new Date().toISOString()
    })

  if (error) {
    throw new Error("RAPPORTAGE_INSERT_FAILED: " + error.message)
  }

  return {
    state: "DONE",
    project_id
  }
}

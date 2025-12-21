import { createClient } from "@supabase/supabase-js"

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
)

/*
========================
PLANNING
========================
- placeholder planninggenerator
- builder-contract compliant
- hard falen bij fouten
*/

export default async function planning(payload = {}) {
  const { project_id } = payload

  if (!project_id) {
    throw new Error("PLANNING_MISSING_PROJECT_ID")
  }

  const { error } = await supabase
    .from("planning_results")
    .insert({
      project_id,
      status: "planned",
      created_at: new Date().toISOString()
    })

  if (error) {
    throw new Error("PLANNING_INSERT_FAILED: " + error.message)
  }

  return {
    state: "DONE",
    project_id
  }
}

import { createClient } from "@supabase/supabase-js"

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
)

/*
========================
DERIVE QUANTITIES
========================
- placeholder afleiding
- builder-contract compliant
- hard falen bij fouten
*/

export default async function deriveQuantities(payload = {}) {
  const { project_id } = payload

  if (!project_id) {
    throw new Error("DERIVE_QUANTITIES_MISSING_PROJECT_ID")
  }

  const { error } = await supabase
    .from("quantity_results")
    .insert({
      project_id,
      status: "derived",
      created_at: new Date().toISOString()
    })

  if (error) {
    throw new Error("DERIVE_QUANTITIES_INSERT_FAILED: " + error.message)
  }

  return {
    state: "DONE",
    project_id
  }
}

import { createClient } from "@supabase/supabase-js"

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
)

/*
========================
INSTALLATIES W
========================
- placeholder werktuigbouwkunde
- builder-contract compliant
- hard falen bij fouten
*/

export default async function installatiesW(payload = {}) {
  const { project_id } = payload

  if (!project_id) {
    throw new Error("INSTALLATIES_W_MISSING_PROJECT_ID")
  }

  const { error } = await supabase
    .from("installaties_w_results")
    .insert({
      project_id,
      status: "ok",
      created_at: new Date().toISOString()
    })

  if (error) {
    throw new Error("INSTALLATIES_W_INSERT_FAILED: " + error.message)
  }

  return {
    state: "DONE",
    project_id
  }
}

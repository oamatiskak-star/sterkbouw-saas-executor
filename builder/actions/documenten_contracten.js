import { createClient } from "@supabase/supabase-js"

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
)

/*
========================
DOCUMENTEN – CONTRACTEN
========================
*/

export async function run({ project_id }) {
  console.log("BUILDER DOCUMENT CONTRACTEN START", project_id)

  const inhoud = {
    contract_type: "Aannemingsovereenkomst",
    looptijd_maanden: 14,
    boeteclausule: "0.1% per dag",
    garanties: ["constructief", "installaties"]
  }

  await supabase.from("documenten").insert({
    project_id,
    type: "contracten",
    data: inhoud,
    created_at: new Date().toISOString()
  })

  console.log("BUILDER DOCUMENT CONTRACTEN DONE")

  return inhoud
}

import { createClient } from "@supabase/supabase-js"

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
)

/*
========================
DOCUMENTEN – BESTEK
========================
*/

export async function run({ project_id }) {
  console.log("BUILDER DOCUMENT BESTEK START", project_id)

  const inhoud = {
    titel: "Technisch bestek",
    versie: "1.0",
    onderdelen: [
      "Fundering",
      "Casco",
      "Gevels",
      "Installaties",
      "Afbouw"
    ]
  }

  await supabase.from("documenten").insert({
    project_id,
    type: "bestek",
    data: inhoud,
    created_at: new Date().toISOString()
  })

  console.log("BUILDER DOCUMENT BESTEK DONE")

  return inhoud
}

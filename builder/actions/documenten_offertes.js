import { createClient } from "@supabase/supabase-js"

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
)

/*
========================
DOCUMENTEN – OFFERTES
========================
*/

export async function run({ project_id }) {
  console.log("BUILDER DOCUMENT OFFERTES START", project_id)

  const inhoud = {
    leveranciers: [
      { naam: "Aannemer A", bedrag: 1250000 },
      { naam: "Aannemer B", bedrag: 1310000 }
    ],
    gekozen: "Aannemer A"
  }

  await supabase.from("documenten").insert({
    project_id,
    type: "offertes",
    data: inhoud,
    created_at: new Date().toISOString()
  })

  console.log("BUILDER DOCUMENT OFFERTES DONE")

  return inhoud
}

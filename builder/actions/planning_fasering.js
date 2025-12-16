import { createClient } from "@supabase/supabase-js"

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
)

export async function run({ project_id }) {
  console.log("BUILDER PLANNING FASERING START", project_id)

  const fasen = [
    { fase: "Ontwerp", weken: 6 },
    { fase: "Vergunning", weken: 8 },
    { fase: "Voorbereiding", weken: 4 },
    { fase: "Bouw", weken: 36 },
    { fase: "Oplevering", weken: 2 }
  ]

  await supabase.from("planning").insert({
    project_id,
    type: "fasering",
    data: fasen,
    created_at: new Date().toISOString()
  })

  console.log("BUILDER PLANNING FASERING DONE")
  return fasen
}

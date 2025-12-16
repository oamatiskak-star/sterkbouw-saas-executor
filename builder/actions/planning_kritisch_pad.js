import { createClient } from "@supabase/supabase-js"

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
)

export async function run({ project_id }) {
  console.log("BUILDER PLANNING KRITISCH PAD START", project_id)

  const pad = [
    "Vergunning rond",
    "Casco gereed",
    "Installaties afgerond",
    "Afbouw gereed",
    "Oplevering"
  ]

  await supabase.from("planning").insert({
    project_id,
    type: "kritisch_pad",
    data: pad,
    created_at: new Date().toISOString()
  })

  console.log("BUILDER PLANNING KRITISCH PAD DONE")
  return pad
}

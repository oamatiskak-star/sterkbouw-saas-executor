import { createClient } from "@supabase/supabase-js"

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
)

export async function run({ project_id }) {
  console.log("BUILDER PLANNING DOORLOOPTIJD START", project_id)

  const doorlooptijd_weken = 56

  await supabase.from("planning").insert({
    project_id,
    type: "doorlooptijd",
    data: { weken: doorlooptijd_weken },
    created_at: new Date().toISOString()
  })

  console.log("BUILDER PLANNING DOORLOOPTIJD DONE")
  return { weken: doorlooptijd_weken }
}

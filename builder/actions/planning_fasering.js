import { createClient } from "@supabase/supabase-js"

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
)

/*
========================
PLANNING FASERING – EINDPRODUCT
========================
- GEEN insert
- UPSERT per project
- vaste fasering voor eindproduct
*/

export async function run({ project_id }) {
  if (!project_id) {
    throw new Error("PLANNING_FASERING_MISSING_PROJECT_ID")
  }

  const fasen = [
    { fase: "Ontwerp", weken: 6 },
    { fase: "Vergunning", weken: 8 },
    { fase: "Voorbereiding", weken: 4 },
    { fase: "Bouw", weken: 36 },
    { fase: "Oplevering", weken: 2 }
  ]

  const { error } = await supabase
    .from("planning")
    .upsert(
      {
        project_id,
        type: "fasering",
        data: fasen,
        updated_at: new Date().toISOString()
      },
      {
        onConflict: "project_id,type"
      }
    )

  if (error) {
    throw new Error("PLANNING_FASERING_UPSERT_FAILED: " + error.message)
  }

  return {
    state: "DONE",
    project_id,
    fasering: fasen
  }
}

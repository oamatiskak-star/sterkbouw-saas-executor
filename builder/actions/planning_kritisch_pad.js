import { createClient } from "@supabase/supabase-js"

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
)

/*
========================
PLANNING KRITISCH PAD – EINDPRODUCT
========================
- GEEN insert
- UPSERT per project
- vast onderdeel van eindproduct
*/

export async function run({ project_id }) {
  if (!project_id) {
    throw new Error("PLANNING_KRITISCH_PAD_MISSING_PROJECT_ID")
  }

  const pad = [
    "Vergunning rond",
    "Casco gereed",
    "Installaties afgerond",
    "Afbouw gereed",
    "Oplevering"
  ]

  const { error } = await supabase
    .from("planning")
    .upsert(
      {
        project_id,
        type: "kritisch_pad",
        data: pad,
        updated_at: new Date().toISOString()
      },
      {
        onConflict: "project_id,type"
      }
    )

  if (error) {
    throw new Error("PLANNING_KRITISCH_PAD_UPSERT_FAILED: " + error.message)
  }

  return {
    state: "DONE",
    project_id,
    kritisch_pad: pad
  }
}

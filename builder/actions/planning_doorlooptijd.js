import { createClient } from "@supabase/supabase-js"

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
)

/*
========================
PLANNING DOORLOOPTIJD – EINDPRODUCT
========================
- GEEN insert-spam
- UPSERT per project
- altijd overschrijfbaar
*/

export async function run({ project_id }) {
  if (!project_id) {
    throw new Error("PLANNING_DOORLOOPTIJD_MISSING_PROJECT_ID")
  }

  const doorlooptijd_weken = 56

  const { error } = await supabase
    .from("planning")
    .upsert(
      {
        project_id,
        type: "doorlooptijd",
        data: { weken: doorlooptijd_weken },
        updated_at: new Date().toISOString()
      },
      {
        onConflict: "project_id,type"
      }
    )

  if (error) {
    throw new Error("PLANNING_DOORLOOPTIJD_UPSERT_FAILED: " + error.message)
  }

  return {
    state: "DONE",
    project_id,
    weken: doorlooptijd_weken
  }
}

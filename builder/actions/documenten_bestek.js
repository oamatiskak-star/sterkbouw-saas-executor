import { createClient } from "@supabase/supabase-js"

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
)

/*
========================
DOCUMENT BESTEK – EINDPRODUCT
========================
- GEEN insert-spam
- UPDATE of UPSERT per project
- altijd actueel
*/

export async function run({ project_id }) {
  if (!project_id) {
    throw new Error("DOCUMENT_BESTEK_MISSING_PROJECT_ID")
  }

  const inhoud = {
    titel: "Technisch bestek",
    versie: "1.0",
    gegenereerd_op: new Date().toISOString(),
    onderdelen: [
      "Fundering",
      "Casco",
      "Gevels",
      "Installaties",
      "Afbouw"
    ]
  }

  /*
  ========================
  UPSERT BESTEK
  ========================
  */
  const { error } = await supabase
    .from("documenten")
    .upsert(
      {
        project_id,
        type: "bestek",
        data: inhoud,
        updated_at: new Date().toISOString()
      },
      {
        onConflict: "project_id,type"
      }
    )

  if (error) {
    throw new Error("DOCUMENT_BESTEK_UPSERT_FAILED: " + error.message)
  }

  return {
    state: "DONE",
    project_id,
    document: "bestek"
  }
}

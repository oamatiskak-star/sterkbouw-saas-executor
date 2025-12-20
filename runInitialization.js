import { createClient } from "@supabase/supabase-js"

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
)

const MODULES = {
  documents: "documents_scanner",
  foundation_check: "foundation_analyzer",
  nen_meting: "nen_analyzer",
  bag_bro_check: "bag_bro_analyzer",
  scope_reconstruction: "scope_reconstructor",
  stabu_structure: "calculation_initializer",
  installations_e: "installations_e",
  installations_w: "installations_w",
  planning: "planning_generator",
  report_pdf: "report_preparer"
}

export async function runInitialization({ project_id, options }) {
  for (const key of Object.keys(MODULES)) {
    if (!options[key]) continue

    const module = MODULES[key]

    await supabase.from("project_initialization_log").insert({
      project_id,
      module,
      status: "running",
      started_at: new Date().toISOString()
    })

    // hier wordt jouw bestaande module aangeroepen
    // dispatcher only, geen logica duplicatie

    await supabase
      .from("project_initialization_log")
      .update({
        status: "done",
        finished_at: new Date().toISOString()
      })
      .eq("project_id", project_id)
      .eq("module", module)
  }

  await supabase
    .from("projects")
    .update({ status: "initialized" })
    .eq("id", project_id)
}

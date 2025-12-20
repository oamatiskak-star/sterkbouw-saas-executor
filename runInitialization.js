import { createClient } from "@supabase/supabase-js"

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
)

export async function runInitialization(project_id, options) {
  const modules = [
    "documents_scanner",
    "foundation_analyzer",
    "nen_analyzer",
    "scope_reconstructor",
    "calculation_initializer",
    "installations_generator",
    "planning_generator",
    "report_preparer"
  ]

  for (const module of modules) {
    if (options[module] === false) continue

    const started_at = new Date().toISOString()

    await supabase.from("project_initialization_log").insert({
      project_id,
      module,
      status: "running",
      started_at
    })

    // hier roept executor je bestaande logica aan
    // GEEN PLACEHOLDERS, alleen dispatcher

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

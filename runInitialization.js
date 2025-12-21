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
  if (!project_id) {
    throw new Error("INIT_MISSING_PROJECT_ID")
  }

  if (!options || typeof options !== "object") {
    throw new Error("INIT_MISSING_OPTIONS")
  }

  let executedModules = 0

  for (const key of Object.keys(MODULES)) {
    if (!options[key]) continue

    const module = MODULES[key]
    const startedAt = new Date().toISOString()

    const { error: insertError } = await supabase
      .from("project_initialization_log")
      .insert({
        project_id,
        module,
        status: "running",
        started_at: startedAt
      })

    if (insertError) {
      throw new Error("INIT_LOG_INSERT_FAILED: " + insertError.message)
    }

    executedModules++

    try {
      // dispatcher placeholder
      // hier roept de executor de echte module aan

      const { error: doneError } = await supabase
        .from("project_initialization_log")
        .update({
          status: "done",
          finished_at: new Date().toISOString()
        })
        .eq("project_id", project_id)
        .eq("module", module)

      if (doneError) {
        throw new Error("INIT_LOG_UPDATE_FAILED: " + doneError.message)
      }

    } catch (err) {
      await supabase
        .from("project_initialization_log")
        .update({
          status: "error",
          finished_at: new Date().toISOString(),
          output_ref: err.message
        })
        .eq("project_id", project_id)
        .eq("module", module)

      await supabase
        .from("projects")
        .update({ status: "error" })
        .eq("id", project_id)

      throw err
    }
  }

  if (executedModules === 0) {
    throw new Error("INIT_NO_MODULES_SELECTED")
  }

  await supabase
    .from("projects")
    .update({ status: "initialized" })
    .eq("id", project_id)
}

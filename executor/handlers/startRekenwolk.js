import { createClient } from "@supabase/supabase-js"

/*
====================================
START REKENWOLK – EXECUTOR HANDLER
====================================
- sluit GEEN executor_tasks af
- faalt hard bij Supabase errors
- consistente logging
*/

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
)

export async function handleStartRekenwolk(task) {
  if (!task) {
    throw new Error("REKENWOLK_NO_TASK")
  }

  const project_id = task.project_id || task.payload?.project_id

  if (!project_id) {
    throw new Error("REKENWOLK_PROJECT_ID_MISSING")
  }

  const startedAt = new Date().toISOString()

  /*
  ========================
  START LOG
  ========================
  */
  const { error: startLogError } = await supabase
    .from("project_initialization_log")
    .insert({
      project_id,
      module: "REKENWOLK",
      status: "running",
      started_at: startedAt
    })

  if (startLogError) {
    throw new Error("REKENWOLK_LOG_START_FAILED: " + startLogError.message)
  }

  /*
  ========================
  OPTIONEEL: SCAN RESULTATEN
  ========================
  */
  const { error: scanError } = await supabase
    .from("project_scan_results")
    .select("id")
    .eq("project_id", project_id)
    .limit(1)

  if (scanError) {
    throw new Error("REKENWOLK_SCAN_FETCH_FAILED: " + scanError.message)
  }

  /*
  ========================
  REKENMODULES
  ========================
  */
  const modules = [
    "STABU",
    "HOEVEELHEDEN",
    "INSTALLATIES_E",
    "INSTALLATIES_W",
    "PLANNING",
    "RAPPORTAGE"
  ]

  for (const module of modules) {
    const { error: moduleLogError } = await supabase
      .from("project_initialization_log")
      .insert({
        project_id,
        module,
        status: "done",
        finished_at: new Date().toISOString()
      })

    if (moduleLogError) {
      throw new Error(
        "REKENWOLK_MODULE_LOG_FAILED (" + module + "): " + moduleLogError.message
      )
    }
  }

  /*
  ========================
  CALCULATIE STATUS
  ========================
  */
  const { error: calculatieError } = await supabase
    .from("calculaties")
    .update({
      status: "initialized",
      workflow_status: "concept"
    })
    .eq("project_id", project_id)

  if (calculatieError) {
    throw new Error("REKENWOLK_CALCULATIE_UPDATE_FAILED: " + calculatieError.message)
  }

  /*
  ========================
  SLUIT REKENWOLK LOG
  ========================
  */
  const { error: doneLogError } = await supabase
    .from("project_initialization_log")
    .update({
      status: "done",
      finished_at: new Date().toISOString()
    })
    .eq("project_id", project_id)
    .eq("module", "REKENWOLK")

  if (doneLogError) {
    throw new Error("REKENWOLK_LOG_DONE_FAILED: " + doneLogError.message)
  }

  return {
    state: "DONE",
    project_id
  }
}

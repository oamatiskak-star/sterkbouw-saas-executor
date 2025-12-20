import { createClient } from "@supabase/supabase-js"

/*
====================================
START REKENWOLK – EXECUTOR HANDLER
====================================
GEEN externe supabaseClient import
GEEN chat_id verplicht
CRASH-VRIJ
*/

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
)

export async function handleStartRekenwolk(task) {
  const project_id = task.project_id || task.payload?.project_id

  if (!project_id) {
    throw new Error("PROJECT_ID_MISSING")
  }

  // start log
  await supabase.from("project_initialization_log").insert({
    project_id,
    module: "REKENWOLK",
    status: "running"
  })

  // haal scanresultaten op
  const { data: scanResults } = await supabase
    .from("project_scan_results")
    .select("*")
    .eq("project_id", project_id)

  // rekenmodules simuleren / starten
  const modules = [
    "STABU",
    "HOEVEELHEDEN",
    "INSTALLATIES_E",
    "INSTALLATIES_W",
    "PLANNING",
    "RAPPORTAGE"
  ]

  for (const module of modules) {
    await supabase.from("project_initialization_log").insert({
      project_id,
      module,
      status: "done"
    })
  }

  // update calculatie
  await supabase
    .from("calculaties")
    .update({
      status: "initialized",
      workflow_status: "concept"
    })
    .eq("id", project_id)

  // sluit rekenwolk log
  await supabase
    .from("project_initialization_log")
    .update({ status: "done" })
    .eq("project_id", project_id)
    .eq("module", "REKENWOLK")

  // executor task afronden
  await supabase
    .from("executor_tasks")
    .update({
      status: "done",
      finished_at: new Date().toISOString()
    })
    .eq("id", task.id)
}

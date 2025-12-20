import supabase from "../../supabaseClient.js"

export async function handleStartRekenwolk(task) {
  const { project_id } = task.payload

  /* Log start */
  await supabase.from("project_initialization_log").insert({
    project_id,
    module: "REKENWOLK",
    status: "running"
  })

  /* Haal scanresultaten op */
  const { data: scanResults } = await supabase
    .from("project_scan_results")
    .select("*")
    .eq("project_id", project_id)

  /* Simuleer modules */
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

  /* Update calculatie status */
  await supabase
    .from("calculaties")
    .update({
      status: "initialized",
      workflow_status: "concept"
    })
    .eq("id", project_id)

  /* Log afronden */
  await supabase
    .from("project_initialization_log")
    .update({ status: "done" })
    .eq("project_id", project_id)
    .eq("module", "REKENWOLK")

  /* Task afronden */
  await supabase
    .from("executor_tasks")
    .update({ status: "done" })
    .eq("id", task.id)
}

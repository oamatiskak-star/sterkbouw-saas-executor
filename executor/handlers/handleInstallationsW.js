import supabase from "../../supabaseClient.js"

export async function handleInstallationsW(task) {
  const { project_id } = task.payload

  await supabase.from("project_initialization_log").insert({
    project_id,
    module: "INSTALLATIES_W",
    status: "running"
  })

  await supabase.from("calculatie_regels").insert([
    {
      calculatie_id: project_id,
      stabu_code: "W01",
      omschrijving: "CV-installatie",
      hoeveelheid: 1,
      eenheid: "st",
      materiaalprijs: 4200,
      arbeidsprijs: 1800,
      totaal: 6000
    }
  ])

  await supabase
    .from("project_initialization_log")
    .update({ status: "done", finished_at: new Date().toISOString() })
    .eq("project_id", project_id)
    .eq("module", "INSTALLATIES_W")

  await supabase.from("executor_tasks").insert({
    project_id,
    task_type: "PLANNING",
    payload: { project_id },
    status: "open"
  })

  await supabase
    .from("executor_tasks")
    .update({ status: "done" })
    .eq("id", task.id)
}

import supabase from "../../supabaseClient.js"

export async function handleInstallationsE(task) {
  const { project_id } = task.payload

  await supabase.from("project_initialization_log").insert({
    project_id,
    module: "INSTALLATIES_E",
    status: "running"
  })

  await supabase.from("calculatie_regels").insert([
    {
      calculatie_id: project_id,
      stabu_code: "E01",
      omschrijving: "Hoofdverdeelinrichting",
      hoeveelheid: 1,
      eenheid: "st",
      materiaalprijs: 2500,
      arbeidsprijs: 1200,
      totaal: 3700
    }
  ])

  await supabase
    .from("project_initialization_log")
    .update({ status: "done", finished_at: new Date().toISOString() })
    .eq("project_id", project_id)
    .eq("module", "INSTALLATIES_E")

  await supabase.from("executor_tasks").insert({
    project_id,
    task_type: "INSTALLATIES_W",
    payload: { project_id },
    status: "open"
  })

  await supabase
    .from("executor_tasks")
    .update({ status: "done" })
    .eq("id", task.id)
}

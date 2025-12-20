import supabase from "../../supabaseClient.js"

export async function handleGenerateStabu(task) {
  const { project_id } = task.payload

  await supabase.from("project_initialization_log").insert({
    project_id,
    module: "STABU",
    status: "running"
  })

  const stabuItems = [
    { code: "21", name: "Grondwerk" },
    { code: "22", name: "Fundering" },
    { code: "23", name: "Ruwbouw" },
    { code: "24", name: "Gevels" },
    { code: "25", name: "Daken" },
    { code: "26", name: "Afwerking" }
  ]

  await supabase.from("calculatie_stabu").insert(
    stabuItems.map(item => ({
      project_id,
      stabu_code: item.code,
      omschrijving: item.name
    }))
  )

  await supabase
    .from("project_initialization_log")
    .update({ status: "done", finished_at: new Date().toISOString() })
    .eq("project_id", project_id)
    .eq("module", "STABU")

  await supabase.from("executor_tasks").insert({
    project_id,
    task_type: "DERIVE_QUANTITIES",
    payload: { project_id },
    status: "open"
  })

  await supabase
    .from("executor_tasks")
    .update({ status: "done" })
    .eq("id", task.id)
}

import supabase from "../../supabaseClient.js"

export async function handlePlanning(task) {
  const { project_id } = task.payload

  await supabase.from("project_initialization_log").insert({
    project_id,
    module: "PLANNING",
    status: "running"
  })

  await supabase.from("project_planning").insert([
    {
      project_id,
      fase: "Ruwbouw",
      duur_dagen: 60
    },
    {
      project_id,
      fase: "Afbouw",
      duur_dagen: 45
    }
  ])

  await supabase
    .from("project_initialization_log")
    .update({ status: "done", finished_at: new Date().toISOString() })
    .eq("project_id", project_id)
    .eq("module", "PLANNING")

  await supabase.from("executor_tasks").insert({
    project_id,
    task_type: "FINALIZE_REKENWOLK",
    payload: { project_id },
    status: "open"
  })

  await supabase
    .from("executor_tasks")
    .update({ status: "done" })
    .eq("id", task.id)
}

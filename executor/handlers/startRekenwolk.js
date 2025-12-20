import supabase from "../../supabaseClient.js"

export async function handleStartRekenwolk(task) {
  const { project_id } = task.payload

  /* Log start rekenwolk (orkestratie) */
  await supabase.from("project_initialization_log").insert({
    project_id,
    module: "REKENWOLK",
    status: "running"
  })

  /* Start eerst STABU generatie */
  await supabase.from("executor_tasks").insert({
    project_id,
    task_type: "GENERATE_STABU",
    payload: { project_id },
    status: "open"
  })

  /* Markeer deze taak als afgerond */
  await supabase
    .from("executor_tasks")
    .update({ status: "done" })
    .eq("id", task.id)

  /* REKENWOLK log blijft open
     en wordt pas op 'done' gezet
     nadat alle submodules klaar zijn */
}

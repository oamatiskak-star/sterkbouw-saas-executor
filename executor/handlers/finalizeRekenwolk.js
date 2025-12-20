import supabase from "../../supabaseClient.js"

export async function handleFinalizeRekenwolk(task) {
  const { project_id } = task.payload

  await supabase
    .from("project_initialization_log")
    .update({ status: "done", finished_at: new Date().toISOString() })
    .eq("project_id", project_id)
    .eq("module", "REKENWOLK")

  await supabase
    .from("calculaties")
    .update({
      status: "initialized",
      workflow_status: "concept"
    })
    .eq("id", project_id)

  await supabase
    .from("executor_tasks")
    .update({ status: "done" })
    .eq("id", task.id)
}

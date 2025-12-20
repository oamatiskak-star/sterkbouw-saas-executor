import supabase from "../../supabaseClient.js"

export async function handleGenerateRiskReport(task) {
  const { project_id } = task.payload

  await supabase.from("project_initialization_log").insert({
    project_id,
    module: "RISICO",
    status: "running"
  })

  await supabase.from("project_reports").insert({
    project_id,
    report_type: "risk",
    status: "generated"
  })

  await supabase
    .from("project_initialization_log")
    .update({ status: "done", finished_at: new Date().toISOString() })
    .eq("project_id", project_id)
    .eq("module", "RISICO")

  await supabase
    .from("executor_tasks")
    .update({ status: "done" })
    .eq("id", task.id)
}

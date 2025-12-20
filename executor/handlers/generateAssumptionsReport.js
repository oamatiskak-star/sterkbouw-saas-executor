import supabase from "../../supabaseClient.js"

export async function handleGenerateAssumptionsReport(task) {
  const { project_id } = task.payload

  await supabase.from("project_initialization_log").insert({
    project_id,
    module: "AANNAMES",
    status: "running"
  })

  await supabase.from("project_reports").insert({
    project_id,
    report_type: "assumptions",
    status: "generated"
  })

  await supabase
    .from("project_initialization_log")
    .update({ status: "done", finished_at: new Date().toISOString() })
    .eq("project_id", project_id)
    .eq("module", "AANNAMES")

  await supabase.from("executor_tasks").insert({
    project_id,
    task_type: "GENERATE_RISK_REPORT",
    payload: { project_id },
    status: "open"
  })

  await supabase
    .from("executor_tasks")
    .update({ status: "done" })
    .eq("id", task.id)
}

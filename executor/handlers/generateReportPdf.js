import supabase from "../../supabaseClient.js"

export async function handleGenerateReportPdf(task) {
  const { project_id } = task.payload

  await supabase.from("project_initialization_log").insert({
    project_id,
    module: "RAPPORT_PDF",
    status: "running"
  })

  await supabase.from("project_reports").insert({
    project_id,
    report_type: "pdf",
    status: "generated"
  })

  await supabase
    .from("project_initialization_log")
    .update({ status: "done", finished_at: new Date().toISOString() })
    .eq("project_id", project_id)
    .eq("module", "RAPPORT_PDF")

  await supabase.from("executor_tasks").insert({
    project_id,
    task_type: "GENERATE_ASSUMPTIONS_REPORT",
    payload: { project_id },
    status: "open"
  })

  await supabase
    .from("executor_tasks")
    .update({ status: "done" })
    .eq("id", task.id)
}

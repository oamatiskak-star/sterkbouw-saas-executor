import supabase from "../../supabaseClient.js"

export async function handleProjectScan(task) {
  const { project_id, files } = task.payload

  /* LOG START */
  await supabase.from("project_initialization_log").insert({
    project_id,
    module: "PROJECT_SCAN",
    status: "running"
  })

  /* 1. Scan documenten */
  const scanResult = []

  for (const file of files) {
    scanResult.push({
      file_name: file.name,
      storage_path: file.path,
      type: file.name.toLowerCase().includes("tekening")
        ? "drawing"
        : "document"
    })
  }

  /* 2. Opslaan scanresultaat */
  await supabase
    .from("project_scan_results")
    .insert(
      scanResult.map(r => ({
        project_id,
        file_name: r.file_name,
        storage_path: r.storage_path,
        detected_type: r.type
      }))
    )

  /* 3. Log afronden */
  await supabase
    .from("project_initialization_log")
    .update({ status: "done" })
    .eq("project_id", project_id)
    .eq("module", "PROJECT_SCAN")

  /* 4. Start rekenwolk */
  await supabase.from("executor_tasks").insert({
    project_id,
    task_type: "START_REKENWOLK",
    payload: {
      project_id
    },
    status: "open"
  })

  /* 5. Task afronden */
  await supabase
    .from("executor_tasks")
    .update({ status: "done" })
    .eq("id", task.id)
}

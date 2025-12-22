import supabase from "../../supabaseClient.js"

function assert(cond, msg) {
  if (!cond) throw new Error(msg)
}

/*
========================
PROJECT SCAN – EINDPRODUCT
========================
- valideert project
- controleert uploads
- zet scanresultaten vast
- start STABU automatisch
*/

export default async function projectScan(payload = {}) {
  assert(payload.project_id, "PROJECT_SCAN_MISSING_PROJECT_ID")
  const project_id = payload.project_id

  /*
  ========================
  PROJECT BESTAAT
  ========================
  */
  const { data: project, error: projectErr } = await supabase
    .from("projects")
    .select("id")
    .eq("id", project_id)
    .single()

  assert(!projectErr && project, "PROJECT_SCAN_PROJECT_NOT_FOUND")

  /*
  ========================
  BESTANDEN CONTROLE
  ========================
  */
  const { data: files, error: filesErr } = await supabase
    .from("project_files")
    .select("id, filename")
    .eq("project_id", project_id)

  assert(!filesErr, "PROJECT_SCAN_FILES_FETCH_FAILED")
  assert(files && files.length > 0, "PROJECT_SCAN_NO_FILES")

  /*
  ========================
  SCAN RESULTAAT OPSLAAN
  ========================
  */
  const { error: scanInsertErr } = await supabase
    .from("project_scan_results")
    .insert({
      project_id,
      file_count: files.length,
      status: "ok",
      scanned_at: new Date().toISOString()
    })

  assert(!scanInsertErr, "PROJECT_SCAN_RESULT_INSERT_FAILED")

  /*
  ========================
  VOLGENDE STAP: STABU
  ========================
  */
  const { error: nextTaskErr } = await supabase
    .from("executor_tasks")
    .insert({
      project_id,
      task_type: "GENERATE_STABU",
      payload: { project_id },
      status: "open",
      assigned_to: "executor"
    })

  assert(!nextTaskErr, "PROJECT_SCAN_NEXT_TASK_FAILED")

  /*
  ========================
  CALCULATIE STATUS
  ========================
  */
  await supabase
    .from("calculaties")
    .update({
      workflow_status: "scanned"
    })
    .eq("project_id", project_id)

  return {
    state: "DONE",
    project_id,
    files_scanned: files.length
  }
}

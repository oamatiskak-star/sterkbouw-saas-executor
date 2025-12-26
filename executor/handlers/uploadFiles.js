import { createClient } from "@supabase/supabase-js"

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
)

function assert(cond, msg) {
  if (!cond) throw new Error(msg)
}

export async function handleUploadFiles(task) {
  assert(task && task.id, "UPLOAD_NO_TASK")

  const taskId = task.id
  const payload = task.payload || {}
  const project_id = task.project_id || payload.project_id
  const files = payload.files || []

  assert(project_id, "UPLOAD_NO_PROJECT_ID")
  assert(Array.isArray(files) && files.length > 0, "UPLOAD_NO_FILES")

  /*
  ============================
  BESTANDEN REGISTREREN
  ============================
  */
  for (const f of files) {
    assert(f.filename, "UPLOAD_FILE_NO_FILENAME")

    const { error } = await supabase
      .from("project_files")
      .insert({
        project_id,
        file_name: f.filename,
        status: "registered",
        bucket: "sterkcalc"
      })

    if (error) {
      throw new Error("UPLOAD_FILE_REGISTER_FAILED: " + error.message)
    }
  }

  /*
  ============================
  PROJECT STATUS BIJWERKEN
  ============================
  */
  await supabase
    .from("projects")
    .update({
      files_uploaded: true,
      updated_at: new Date().toISOString()
    })
    .eq("id", project_id)

  /*
  ============================
  VOLGENDE STAP: PROJECT_SCAN
  ============================
  */
  const { data: existingScan } = await supabase
    .from("executor_tasks")
    .select("id")
    .eq("project_id", project_id)
    .eq("action", "project_scan")
    .in("status", ["open", "running", "completed"])
    .maybeSingle()

  if (!existingScan) {
    await supabase
      .from("executor_tasks")
      .insert({
        project_id,
        action: "project_scan",
        status: "open",
        assigned_to: "executor",
        payload: { project_id }
      })
  }

  /*
  ============================
  HUIDIGE TASK AFRONDEN
  ============================
  */
  await supabase
    .from("executor_tasks")
    .update({
      status: "completed",
      finished_at: new Date().toISOString()
    })
    .eq("id", taskId)

  return {
    state: "DONE",
    project_id,
    files_registered: files.length
  }
}

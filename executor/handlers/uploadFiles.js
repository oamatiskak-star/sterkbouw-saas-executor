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
  assert(task.project_id || task.payload?.project_id, "UPLOAD_NO_PROJECT_ID")

  const taskId = task.id
  const project_id = task.project_id || task.payload.project_id
  const payload = task.payload || {}
  const files = Array.isArray(payload.files) ? payload.files : []
  const now = new Date().toISOString()

  assert(files.length > 0, "UPLOAD_NO_FILES")

  try {
    /*
    ============================
    TASK → RUNNING
    ============================
    */
    await supabase
      .from("executor_tasks")
      .update({
        status: "running",
        started_at: now
      })
      .eq("id", taskId)

    /*
    ============================
    BESTANDEN REGISTREREN
    ============================
    */
    for (const f of files) {
      assert(f.filename, "UPLOAD_FILE_NO_FILENAME")

      const { error: insertErr } = await supabase
        .from("project_files")
        .insert({
          project_id,
          file_name: f.filename,
          status: "uploaded",
          bucket: "sterkcalc",
          created_at: now
        })

      if (insertErr) {
        throw new Error("UPLOAD_FILE_REGISTER_FAILED: " + insertErr.message)
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
        updated_at: now
      })
      .eq("id", project_id)

    /*
    ============================
    VOLGENDE STAP: PROJECT_SCAN
    (HARD GARANTIE)
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
    TASK → COMPLETED
    ============================
    */
    await supabase
      .from("executor_tasks")
      .update({
        status: "completed",
        finished_at: now
      })
      .eq("id", taskId)

    return {
      state: "DONE",
      project_id,
      files_registered: files.length
    }

  } catch (err) {
    await supabase
      .from("executor_tasks")
      .update({
        status: "failed",
        error: err.message,
        finished_at: new Date().toISOString()
      })
      .eq("id", taskId)

    throw err
  }
}

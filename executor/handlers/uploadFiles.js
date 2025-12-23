import fs from "fs"
import { createClient } from "@supabase/supabase-js"

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
)

function assert(cond, msg) {
  if (!cond) throw new Error(msg)
}

export async function handleUploadFiles(task) {
  assert(task, "UPLOAD_NO_TASK")

  const payload = task.payload || {}
  const project_id = task.project_id || payload.project_id
  const files = payload.files || []

  assert(project_id, "UPLOAD_NO_PROJECT_ID")
  assert(Array.isArray(files) && files.length > 0, "UPLOAD_NO_FILES")

  const bucket = "sterkcalc"
  let uploaded = 0

  for (const f of files) {
    assert(f.local_path && f.filename, "UPLOAD_FILE_INVALID")

    const buffer = fs.readFileSync(f.local_path)
    const target_path = `${project_id}/${Date.now()}_${f.filename}`

    const { error: uploadError } = await supabase.storage
      .from(bucket)
      .upload(target_path, buffer, {
        contentType: f.content_type || "application/octet-stream",
        upsert: false
      })

    if (uploadError) {
      throw new Error("UPLOAD_STORAGE_FAILED: " + uploadError.message)
    }

    const { error: dbError } = await supabase
      .from("project_files")
      .insert({
        project_id,
        file_name: f.filename,
        storage_path: target_path,
        bucket
      })

    if (dbError) {
      throw new Error("UPLOAD_DB_FAILED: " + dbError.message)
    }

    uploaded++
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
      analysis_status: "queued",
      updated_at: new Date().toISOString()
    })
    .eq("id", project_id)

  /*
  ============================
  HUIDIGE TASK SLUITEN
  ============================
  */
  if (task.id) {
    await supabase
      .from("executor_tasks")
      .update({
        status: "completed",
        finished_at: new Date().toISOString()
      })
      .eq("id", task.id)
  }

  /*
  ============================
  PRODUCER GUARD: PROJECT_SCAN
  ============================
  */
  const { data: existingScan } = await supabase
    .from("executor_tasks")
    .select("id")
    .eq("project_id", project_id)
    .eq("action", "project_scan")
    .in("status", ["open", "running", "completed"])
    .limit(1)
    .maybeSingle()

  if (!existingScan) {
    await supabase
      .from("executor_tasks")
      .insert({
        project_id,
        action: "project_scan",
        payload: { project_id },
        status: "open",
        assigned_to: "executor"
      })
  }

  return {
    state: "DONE",
    project_id,
    uploaded
  }
}

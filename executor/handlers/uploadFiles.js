import fs from "fs"
import { createClient } from "@supabase/supabase-js"

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
)

/*
payload verwacht:
{
  project_id: "uuid",
  files: [
    {
      local_path: "/tmp/upload/abc.pdf",
      filename: "abc.pdf",
      content_type: "application/pdf"
    }
  ]
}
*/

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
    assert(f.local_path && f.filename, "UPLOAD_FILE_INVALID_PAYLOAD")

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
        filename: f.filename,
        path: target_path,
        bucket
      })

    if (dbError) {
      throw new Error("UPLOAD_DB_FAILED: " + dbError.message)
    }

    uploaded++
  }

  /*
  ============================
  SLUIT HUIDIGE TASK
  ============================
  */
  if (task.id) {
    await supabase
      .from("executor_tasks")
      .update({ status: "done" })
      .eq("id", task.id)
  }

  /*
  ============================
  START PROJECT SCAN
  ============================
  */
  const { error: nextErr } = await supabase
    .from("executor_tasks")
    .insert({
      project_id,
      action: "project_scan",
      payload: { project_id },
      status: "open",
      assigned_to: "executor"
    })

  if (nextErr) {
    throw new Error("UPLOAD_NEXT_TASK_FAILED: " + nextErr.message)
  }

  return {
    state: "DONE",
    project_id,
    uploaded
  }
}

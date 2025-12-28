import { createClient } from "@supabase/supabase-js"
import { TwoJoursWriter } from "../../builder/pdf/TwoJoursWriter.js"

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
)

function assert(cond, msg) {
  if (!cond) throw new Error(msg)
}

/*
=====================================
HULPFUNCTIE: CALCULATIE BOOTSTRAP
- Wordt exact 1x aangemaakt
- Nodig vóór elke PDF-write
=====================================
*/
async function ensureCalculatie(project_id) {
  const { data: existing, error } = await supabase
    .from("calculaties")
    .select("id")
    .eq("project_id", project_id)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle()

  if (error) {
    throw new Error("CALCULATIE_LOOKUP_FAILED: " + error.message)
  }

  if (existing) return existing.id

  const { data: created, error: insertErr } = await supabase
    .from("calculaties")
    .insert({
      project_id,
      workflow_status: "initialized",
      created_at: new Date().toISOString()
    })
    .select("id")
    .single()

  if (insertErr) {
    throw new Error("CALCULATIE_CREATE_FAILED: " + insertErr.message)
  }

  return created.id
}

export async function handleUploadFiles(task) {
  assert(task && task.id, "UPLOAD_NO_TASK")
  assert(task.project_id || task.payload?.project_id, "UPLOAD_NO_PROJECT_ID")

  const taskId = task.id
  const project_id = task.project_id || task.payload.project_id
  const payload = task.payload || {}
  const files = Array.isArray(payload.files) ? payload.files : []
  const now = new Date().toISOString()

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
    CALCULATIE GARANTEREN
    ============================
    */
    await ensureCalculatie(project_id)

    /*
    ============================
    2JOURS PDF INITIALISEREN
    ============================
    */
    const pdf = await TwoJoursWriter.open(project_id)

    /*
    ============================
    GEEN BESTANDEN = GELDIGE STATE
    ============================
    */
    if (files.length === 0) {
      await pdf.writeSection("upload.bestanden", {
        titel: "Aangeleverde documenten",
        bestanden: []
      })

      await pdf.save()

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
        files_registered: 0
      }
    }

    /*
    ============================
    BESTANDEN REGISTREREN
    ============================
    */
    const registeredFiles = []

    for (const f of files) {
      assert(f.filename, "UPLOAD_FILE_NO_FILENAME")

      const storage_path = `${project_id}/${f.filename}`

      const { error: insertErr } = await supabase
        .from("project_files")
        .insert({
          project_id,
          file_name: f.filename,
          storage_path,
          bucket: "sterkcalc",
          status: "uploaded",
          created_at: now
        })

      if (insertErr) {
        throw new Error("UPLOAD_FILE_REGISTER_FAILED: " + insertErr.message)
      }

      registeredFiles.push({
        filename: f.filename,
        storage_path,
        uploaded_at: now
      })
    }

    /*
    ============================
    UPLOAD RESULTAAT → PDF
    ============================
    */
    await pdf.writeSection("upload.bestanden", {
      titel: "Aangeleverde documenten",
      bestanden: registeredFiles
    })

    await pdf.save()

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

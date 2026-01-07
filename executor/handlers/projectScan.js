// executor/handlers/projectScan.js
import { createClient } from "@supabase/supabase-js"
import { sendTelegram } from "../../integrations/telegramSender.js"

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  {
    auth: {
      persistSession: false,
      autoRefreshToken: false
    }
  }
)

console.log("[PROJECT_SCAN] Module loaded")

export async function handleProjectScan(task) {
  if (!task?.id || !task.project_id) {
    console.error("[PROJECT_SCAN] Invalid task payload", task)
    return
  }

  const taskId = task.id
  const project_id = task.project_id
  const now = new Date().toISOString()

  console.log("[PROJECT_SCAN] START", { taskId, project_id })

  try {
    /* ============================
       TASK → RUNNING
    ============================ */
    await supabase
      .from("executor_tasks")
      .update({ status: "running", started_at: now })
      .eq("id", taskId)

    /* ============================
       STORAGE: BESTANDEN OPHALEN
       (bucket: sterkcalc)
    ============================ */
    console.log("[PROJECT_SCAN] Listing storage objects")

    const { data: objects, error: storageError } = await supabase.storage
  .from("sterkcalc")
  .list(project_id, { recursive: true })

    if (storageError) {
      throw new Error(`STORAGE_LIST_FAILED: ${storageError.message}`)
    }

    if (!objects || objects.length === 0) {
      throw new Error("NO_PROJECT_FILES_FOUND")
    }

    console.log("[PROJECT_SCAN] Files found:", objects.length)

    /* ============================
       SCAN RESULTEN SCHRIJVEN
       (exact volgens tabel)
    ============================ */
    const scanRows = objects
  .filter(obj => obj.name && !obj.name.endsWith("/")) // geen folders
  .map(obj => ({
    project_id: task.project_id, // 🔒 expliciet
    file_name: obj.name.split("/").pop(),
    storage_path: `${task.project_id}/${obj.name}`,
    detected_type: "file",
    discipline: "general",
    confidence: 1.0,
    created_at: now
  }))

    const { error: insertError } = await supabase
      .from("project_scan_results")
      .insert(scanRows)

    if (insertError) {
      throw new Error(`SCAN_INSERT_FAILED: ${insertError.message}`)
    }

    console.log("[PROJECT_SCAN] Scan results inserted:", scanRows.length)

    /* ============================
       generate_stabu ENQUEUE
    ============================ */
    const { data: existingTask } = await supabase
      .from("executor_tasks")
      .select("id")
      .eq("project_id", project_id)
      .eq("action", "generate_stabu")
      .in("status", ["open", "running", "completed"])
      .maybeSingle()

    if (!existingTask) {
      const { error: taskError } = await supabase
        .from("executor_tasks")
        .insert({
          project_id,
          action: "generate_stabu",
          status: "open",
          assigned_to: "executor",
          payload: { project_id },
          created_at: now
        })

      if (taskError) {
        throw new Error(`GENERATE_STABU_TASK_FAILED: ${taskError.message}`)
      }

      console.log("[PROJECT_SCAN] generate_stabu task created")
    } else {
      console.log("[PROJECT_SCAN] generate_stabu already exists")
    }

    /* ============================
       TASK → COMPLETED
    ============================ */
    await supabase
      .from("executor_tasks")
      .update({
        status: "completed",
        finished_at: now
      })
      .eq("id", taskId)

    console.log("[PROJECT_SCAN] COMPLETED SUCCESSFULLY")

  } catch (err) {
    console.error("[PROJECT_SCAN] FAILED", err)

    await supabase
      .from("executor_tasks")
      .update({
        status: "failed",
        error: err.message,
        finished_at: new Date().toISOString()
      })
      .eq("id", taskId)

    await supabase
      .from("executor_errors")
      .insert({
        task_id: taskId,
        project_id,
        action: "project_scan",
        error: err.message,
        stack: err.stack,
        created_at: new Date().toISOString()
      })

    await sendTelegram(
      `[PROJECT_SCAN FAILED]\nProject: ${project_id}\nError: ${err.message}`
    )
  }
}

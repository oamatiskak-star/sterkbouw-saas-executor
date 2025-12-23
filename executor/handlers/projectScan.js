import { createClient } from "@supabase/supabase-js"
import { sendTelegram } from "../../integrations/telegramSender.js"

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
)

export async function handleProjectScan(task) {
  console.log("[PROJECT_SCAN] START", task)

  if (!task || !task.id || !task.project_id) {
    console.error("[PROJECT_SCAN] INVALID_TASK")
    return
  }

  const taskId = task.id
  const project_id = task.project_id
  const payload =
    task.payload && typeof task.payload === "object" ? task.payload : {}

  const chatId = payload.chat_id || null

  try {
    /*
    VALIDATIE: PROJECT BESTAAT
    */
    const { data: project, error: projectError } = await supabase
      .from("projects")
      .select("id")
      .eq("id", project_id)
      .single()

    if (projectError || !project) {
      throw new Error("PROJECT_SCAN_PROJECT_NOT_FOUND")
    }

    /*
    STATUS → RUNNING
    */
    await supabase
      .from("projects")
      .update({
        analysis_status: "running",
        updated_at: new Date().toISOString()
      })
      .eq("id", project_id)

    await supabase
      .from("project_initialization_log")
      .insert({
        project_id,
        module: "PROJECT_SCAN",
        status: "running",
        started_at: new Date().toISOString()
      })

    if (chatId) {
      try {
        await sendTelegram(chatId, "Projectscan gestart")
      } catch (_) {}
    }

    /*
    BESTANDEN OPHALEN
    */
    const { data: files, error: filesError } = await supabase
      .from("project_files")
      .select("file_name, storage_path")
      .eq("project_id", project_id)

    if (filesError) {
      throw new Error("PROJECT_SCAN_FILES_FETCH_FAILED")
    }

    if (!files || files.length === 0) {
      throw new Error("PROJECT_SCAN_NO_UPLOADS")
    }

    /*
    SCAN RESULTAAT
    */
    const scanResult = {
      files: files.map(f => ({
        name: f.file_name,
        path: f.storage_path
      })),
      file_count: files.length,
      scanned_at: new Date().toISOString()
    }

    await supabase
      .from("project_scan_results")
      .insert({
        project_id,
        result: scanResult
      })

    /*
    STATUS → COMPLETED
    */
    await supabase
      .from("projects")
      .update({
        analysis_status: "completed",
        updated_at: new Date().toISOString()
      })
      .eq("id", project_id)

    await supabase
      .from("project_initialization_log")
      .update({
        status: "done",
        finished_at: new Date().toISOString()
      })
      .eq("project_id", project_id)
      .eq("module", "PROJECT_SCAN")

    await supabase
      .from("executor_tasks")
      .update({
        status: "completed",
        finished_at: new Date().toISOString()
      })
      .eq("id", taskId)

    if (chatId) {
      try {
        await sendTelegram(chatId, "Projectscan afgerond")
      } catch (_) {}
    }

    console.log("[PROJECT_SCAN] DONE", project_id)
  } catch (err) {
    console.error("[PROJECT_SCAN] FAILED", err.message)

    await supabase
      .from("projects")
      .update({
        analysis_status: "failed",
        updated_at: new Date().toISOString()
      })
      .eq("id", project_id)

    await supabase
      .from("project_initialization_log")
      .update({
        status: "failed",
        finished_at: new Date().toISOString()
      })
      .eq("project_id", project_id)
      .eq("module", "PROJECT_SCAN")

    await supabase
      .from("executor_tasks")
      .update({
        status: "failed",
        error: err.message,
        finished_at: new Date().toISOString()
      })
      .eq("id", taskId)
  }
}

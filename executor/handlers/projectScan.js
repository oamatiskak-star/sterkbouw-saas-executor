import { createClient } from "@supabase/supabase-js"
import { sendTelegram } from "../../integrations/telegramSender.js"

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
)

export async function handleProjectScan(task) {
  if (!task?.id || !task.project_id) return

  const taskId = task.id
  const project_id = task.project_id
  const payload = task.payload || {}
  const chatId = payload.chat_id || null

  try {
    // LOCK: nooit 2 scans tegelijk
    const { data: running } = await supabase
      .from("executor_tasks")
      .select("id")
      .eq("project_id", project_id)
      .eq("action", "project_scan")
      .eq("status", "running")
      .maybeSingle()

    if (running) {
      await supabase
        .from("executor_tasks")
        .update({ status: "skipped" })
        .eq("id", taskId)
      return
    }

    await supabase
      .from("executor_tasks")
      .update({
        status: "running",
        started_at: new Date().toISOString()
      })
      .eq("id", taskId)

    // === ANALYSE START ===
    await supabase
      .from("projects")
      .update({
        analysis_status: false,
        updated_at: new Date().toISOString()
      })
      .eq("id", project_id)

    await supabase.from("project_initialization_log").insert({
      project_id,
      module: "PROJECT_SCAN",
      status: "running",
      started_at: new Date().toISOString()
    })

    if (chatId) await sendTelegram(chatId, "Projectscan gestart")

    // === FILES ===
    const { data: files } = await supabase
      .from("project_files")
      .select("file_name")
      .eq("project_id", project_id)

    const warnings = []
    if (!files || files.length === 0) {
      warnings.push("Geen bestanden aangetroffen")
    }

    // === ANALYSE KLAAR ===
    await supabase
      .from("projects")
      .update({
        analysis_status: true,
        warnings,
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

    // === VOLGENDE STAP ===
    await supabase.from("executor_tasks").insert({
      project_id,
      action: "generate_stabu",
      status: "open",
      assigned_to: "executor",
      payload: { project_id }
    })

    await supabase
      .from("executor_tasks")
      .update({
        status: "completed",
        finished_at: new Date().toISOString()
      })
      .eq("id", taskId)

    if (chatId) await sendTelegram(chatId, "Projectscan afgerond")
  } catch (err) {
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

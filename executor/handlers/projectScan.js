import { createClient } from "@supabase/supabase-js"
import { sendTelegram } from "../../integrations/telegramSender.js"

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
)

export async function handleProjectScan(task) {
  if (!task?.id || !task.project_id) {
    return
  }

  const taskId = task.id
  const project_id = task.project_id
  const payload = task.payload || {}
  const chatId = payload.chat_id || null

  try {
    // ===== STATUS: RUNNING =====
    await supabase
      .from("executor_tasks")
      .update({
        status: "running",
        started_at: new Date().toISOString()
      })
      .eq("id", taskId)

    // ===== PROJECT ANALYSE =====
    await supabase
      .from("projects")
      .update({
        analysis_status: true,
        updated_at: new Date().toISOString()
      })
      .eq("id", project_id)

    // ===== LOG =====
    await supabase.from("project_initialization_log").insert({
      project_id,
      module: "PROJECT_SCAN",
      status: "done",
      started_at: new Date().toISOString(),
      finished_at: new Date().toISOString()
    })

    if (chatId) {
      await sendTelegram(chatId, "Projectscan afgerond")
    }

    // ===== HARD DOORZETTEN NAAR STABU =====
    await supabase.from("executor_tasks").insert({
      project_id,
      action: "generate_stabu",
      status: "open",
      assigned_to: "executor",
      payload: { project_id, chat_id: chatId }
    })

    // ===== TASK COMPLETED =====
    await supabase
      .from("executor_tasks")
      .update({
        status: "completed",
        finished_at: new Date().toISOString()
      })
      .eq("id", taskId)

  } catch (err) {
    await supabase
      .from("executor_tasks")
      .update({
        status: "failed",
        error: err.message || "project_scan_failed",
        finished_at: new Date().toISOString()
      })
      .eq("id", taskId)
  }
}

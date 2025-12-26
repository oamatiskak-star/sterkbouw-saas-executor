import supabase from "../lib/supabase.js"
import { sendTelegram } from "../../integrations/telegramSender.js"

export async function handleProjectScan(task) {
  if (!task?.id || !task.project_id) return

  const taskId = task.id
  const project_id = task.project_id
  const payload = task.payload || {}
  const chatId = payload.chat_id || null

  try {
    // status running
    await supabase
      .from("executor_tasks")
      .update({
        status: "running",
        started_at: new Date().toISOString()
      })
      .eq("id", taskId)

    // analyse afronden
    await supabase
      .from("projects")
      .update({
        analysis_status: true,
        updated_at: new Date().toISOString()
      })
      .eq("id", project_id)

    // log
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

    // ALTIJD volgende stap
    await supabase.from("executor_tasks").insert({
      project_id,
      action: "generate_stabu",
      status: "open",
      assigned_to: "executor",
      payload: { project_id, chat_id: chatId }
    })

    // afronden
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

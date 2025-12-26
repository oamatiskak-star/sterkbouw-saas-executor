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
    PROJECT ANALYSE AFRONDEN
    ============================
    */
    await supabase
      .from("projects")
      .update({
        analysis_status: true,
        updated_at: now
      })
      .eq("id", project_id)

    /*
    ============================
    INIT LOG
    ============================
    */
    await supabase
      .from("project_initialization_log")
      .insert({
        project_id,
        module: "PROJECT_SCAN",
        status: "done",
        started_at: now,
        finished_at: now
      })

    if (chatId) {
      await sendTelegram(chatId, "Projectscan afgerond")
    }

    /*
    ============================
    TASK → COMPLETED (EERST)
    ============================
    */
    await supabase
      .from("executor_tasks")
      .update({
        status: "completed",
        finished_at: now
      })
      .eq("id", taskId)

    /*
    ============================
    VOLGENDE STAP: GENERATE_STABU
    (GUARDED – 1×)
    ============================
    */
    const { data: existing } = await supabase
      .from("executor_tasks")
      .select("id")
      .eq("project_id", project_id)
      .eq("action", "generate_stabu")
      .in("status", ["open", "running", "completed"])
      .limit(1)
      .maybeSingle()

    if (!existing) {
      await supabase
        .from("executor_tasks")
        .insert({
          project_id,
          action: "generate_stabu",
          status: "open",
          assigned_to: "executor",
          payload: { project_id, chat_id: chatId }
        })
    }

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

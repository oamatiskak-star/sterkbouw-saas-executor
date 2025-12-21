import { createClient } from "@supabase/supabase-js"
import { sendTelegram } from "../../integrations/telegramSender.js"

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
)

export async function handleProjectScan(task) {
  if (!task || !task.project_id) {
    throw new Error("PROJECT_SCAN_NO_PROJECT_ID")
  }

  const project_id = task.project_id
  const payload =
    task.payload && typeof task.payload === "object" ? task.payload : {}

  const chatId = payload.chat_id || null

  if (chatId) {
    try {
      await sendTelegram(chatId, "Projectscan gestart")
    } catch (_) {}
  }

  /*
  ========================
  START LOG
  ========================
  */
  const { error: startLogError } = await supabase
    .from("project_initialization_log")
    .insert({
      project_id,
      module: "PROJECT_SCAN",
      status: "running",
      started_at: new Date().toISOString()
    })

  if (startLogError) {
    throw new Error("PROJECT_SCAN_LOG_START_FAILED: " + startLogError.message)
  }

  /*
  ========================
  SCAN PLACEHOLDER
  ========================
  */
  await new Promise(resolve => setTimeout(resolve, 500))

  /*
  ========================
  DONE LOG
  ========================
  */
  const { error: doneLogError } = await supabase
    .from("project_initialization_log")
    .update({
      status: "done",
      finished_at: new Date().toISOString()
    })
    .eq("project_id", project_id)
    .eq("module", "PROJECT_SCAN")

  if (doneLogError) {
    throw new Error("PROJECT_SCAN_LOG_DONE_FAILED: " + doneLogError.message)
  }

  /*
  ========================
  VOLGENDE EXECUTOR TASK
  ========================
  */
  const { error: nextTaskError } = await supabase
    .from("executor_tasks")
    .insert({
      project_id,
      action: "START_REKENWOLK",
      payload,
      status: "open",
      assigned_to: "executor"
    })

  if (nextTaskError) {
    throw new Error("PROJECT_SCAN_NEXT_TASK_FAILED: " + nextTaskError.message)
  }

  if (chatId) {
    try {
      await sendTelegram(chatId, "Projectscan afgerond. Rekenwolk start.")
    } catch (_) {}
  }

  return {
    state: "DONE",
    project_id
  }
}

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
    await sendTelegram(chatId, "🔍 Projectscan gestart")
  }

  /* =========================
     START LOG
  ========================= */
  await supabase.from("project_initialization_log").insert({
    project_id,
    module: "PROJECT_SCAN",
    status: "running",
    started_at: new Date().toISOString()
  })

  /* =========================
     SCAN (STABIEL)
     hier komt straks echte scan
  ========================= */
  await new Promise(resolve => setTimeout(resolve, 500))

  /* =========================
     DONE LOG
  ========================= */
  await supabase.from("project_initialization_log").insert({
    project_id,
    module: "PROJECT_SCAN",
    status: "done",
    finished_at: new Date().toISOString()
  })

  /* =========================
     VOLGENDE STAP AANMAKEN
     START_REKENWOLK
  ========================= */
  await supabase.from("executor_tasks").insert({
    project_id,
    action: "START_REKENWOLK",
    payload,
    status: "open",
    assigned_to: "executor"
  })

  /* =========================
     HUIDIGE TASK AFRONDEN
  ========================= */
  await supabase
    .from("executor_tasks")
    .update({
      status: "done",
      finished_at: new Date().toISOString()
    })
    .eq("id", task.id)

  if (chatId) {
    await sendTelegram(chatId, "✅ Projectscan afgerond. Rekenwolk start…")
  }
}

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

  if (chatId) {
    try {
      await sendTelegram(chatId, "Projectscan gestart")
    } catch (_) {}
  }

  /*
  ========================
  VALIDATIES (ECHT)
  ========================
  */

  // 1. Project moet bestaan
  const { data: project, error: projectError } = await supabase
    .from("projects")
    .select("id")
    .eq("id", project_id)
    .single()

  if (projectError || !project) {
    throw new Error("PROJECT_SCAN_PROJECT_NOT_FOUND")
  }

  // 2. Uploads moeten bestaan
  const { data: files, error: filesError } = await supabase
    .from("project_files")
    .select("id")
    .eq("project_id", project_id)

  if (filesError) {
    throw new Error("PROJECT_SCAN_FILES_FETCH_FAILED: " + filesError.message)
  }

  if (!files || files.length === 0) {
    throw new Error("PROJECT_SCAN_NO_UPLOADS")
  }

  // 3. STABU moet gevuld zijn
  const { count: stabuCount, error: stabuError } = await supabase
    .from("stabu_regels")
    .select("*", { count: "exact", head: true })

  if (stabuError || !stabuCount || stabuCount === 0) {
    throw new Error("PROJECT_SCAN_NO_STABU_DATA")
  }

  // 4. Hoeveelheden-bron moet bestaan
  const { count: qtyCount, error: qtyError } = await supabase
    .from("project_hoeveelheden")
    .select("*", { count: "exact", head: true })
    .eq("project_id", project_id)

  if (qtyError) {
    throw new Error("PROJECT_SCAN_QTY_FETCH_FAILED: " + qtyError.message)
  }

  if (!qtyCount || qtyCount === 0) {
    throw new Error("PROJECT_SCAN_NO_QUANTITIES")
  }

  /*
  ========================
  SCAN RESULTAAT VASTLEGGEN
  ========================
  */
  const scanResult = {
    uploads: files.length,
    stabu_rules: stabuCount,
    quantities: qtyCount,
    scanned_at: new Date().toISOString()
  }

  const { error: resultError } = await supabase
    .from("project_scan_results")
    .insert({
      project_id,
      result: scanResult
    })

  if (resultError) {
    throw new Error("PROJECT_SCAN_RESULT_WRITE_FAILED: " + resultError.message)
  }

  /*
  ========================
  LOG DONE
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
  SLUIT HUIDIGE TASK
  ========================
  */
  if (task.id) {
    await supabase
      .from("executor_tasks")
      .update({ status: "done" })
      .eq("id", task.id)
  }

  /*
  ========================
  START REKENWOLK
  ========================
  */
  const { error: nextTaskError } = await supabase
    .from("executor_tasks")
    .insert({
      project_id,
      action: "start_rekenwolk",
      payload: { project_id, chat_id: chatId },
      status: "open",
      assigned_to: "executor"
    })

  if (nextTaskError) {
    throw new Error("PROJECT_SCAN_NEXT_TASK_FAILED: " + nextTaskError.message)
  }

  if (chatId) {
    try {
      await sendTelegram(chatId, "Projectscan afgerond. Rekenwolk gestart.")
    } catch (_) {}
  }

  return {
    state: "DONE",
    project_id,
    scan: scanResult
  }
}

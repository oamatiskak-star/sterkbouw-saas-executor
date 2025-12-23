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

  try {
    /*
    ========================
    STATUS → RUNNING
    ========================
    */
    await supabase
      .from("projects")
      .update({ analysis_status: "running" })
      .eq("id", project_id)

    /*
    ========================
    START LOG
    ========================
    */
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
    ========================
    VALIDATIES
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
      throw new Error("PROJECT_SCAN_FILES_FETCH_FAILED")
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

    /*
    ========================
    SCAN RESULTAAT
    ========================
    */
    const scanResult = {
      uploads: files.length,
      stabu_rules: stabuCount,
      scanned_at: new Date().toISOString()
    }

    await supabase
      .from("project_scan_results")
      .insert({
        project_id,
        result: scanResult
      })

    /*
    ========================
    STATUS → COMPLETED
    ========================
    */
    await supabase
      .from("projects")
      .update({ analysis_status: "completed" })
      .eq("id", project_id)

    /*
    ========================
    LOG DONE
    ========================
    */
    await supabase
      .from("project_initialization_log")
      .update({
        status: "done",
        finished_at: new Date().toISOString()
      })
      .eq("project_id", project_id)
      .eq("module", "PROJECT_SCAN")

    /*
    ========================
    SLUIT TASK
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
    await supabase
      .from("executor_tasks")
      .insert({
        project_id,
        action: "start_rekenwolk",
        payload: { project_id, chat_id: chatId },
        status: "open",
        assigned_to: "executor"
      })

    if (chatId) {
      try {
        await sendTelegram(
          chatId,
          "Projectscan afgerond. Rekenwolk gestart."
        )
      } catch (_) {}
    }

    return {
      state: "DONE",
      project_id,
      scan: scanResult
    }
  } catch (err) {
    /*
    ========================
    STATUS → FAILED
    ========================
    */
    await supabase
      .from("projects")
      .update({ analysis_status: "failed" })
      .eq("id", project_id)

    if (task.id) {
      await supabase
        .from("executor_tasks")
        .update({
          status: "failed",
          error: err.message
        })
        .eq("id", task.id)
    }

    throw err
  }
}

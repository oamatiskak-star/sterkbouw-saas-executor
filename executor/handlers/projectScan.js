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

  const missing_items = []
  const warnings = []

  try {
    /*
    ========================
    PROJECT OPHALEN
    ========================
    */
    const { data: project } = await supabase
      .from("projects")
      .select("id, project_type")
      .eq("id", project_id)
      .single()

    const projectType = project?.project_type || null

    /*
    ========================
    STATUS → RUNNING (INFORMATIEF)
    ========================
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
    ========================
    BESTANDEN OPHALEN
    ========================
    */
    const { data: files } = await supabase
      .from("project_files")
      .select("file_name, storage_path, file_type")
      .eq("project_id", project_id)

    if (!files || files.length === 0) {
      warnings.push("Geen bestanden aangetroffen")
    }

    const has = type => files?.some(f => f.file_type === type)

    /*
    ========================
    ANALYSE (SIGNALEREND, NOOIT VERPLICHT)
    ========================
    */
    if (!projectType) {
      warnings.push("Projecttype niet ingevuld")
      missing_items.push("project_type")
    }

    if (projectType === "renovatie") {
      if (!has("tekening_bestaand")) missing_items.push("tekening_bestaand")
      if (!has("foto_bestaand")) missing_items.push("foto_bestaand")
    }

    if (projectType === "transformatie") {
      if (!has("tekening_bestaand")) missing_items.push("tekening_bestaand")
      if (!has("tekening_nieuw")) missing_items.push("tekening_nieuw")
    }

    if (projectType === "nieuwbouw_met_sloop") {
      if (!has("tekening_bestaand")) missing_items.push("tekening_bestaand")
      if (!has("tekening_nieuw")) missing_items.push("tekening_nieuw")
    }

    if (projectType === "nieuwbouw") {
      if (!has("tekening_nieuw")) missing_items.push("tekening_nieuw")
    }

    if (missing_items.length > 0) {
      warnings.push(
        "Ontbrekende onderdelen gesignaleerd. Calculatie gaat door met aannames."
      )
    }

    /*
    ========================
    RESULTAAT OPSLAAN (ALTIJD)
    ========================
    */
    await supabase
      .from("projects")
      .update({
        analysis_status: "completed",
        missing_items,
        warnings,
        updated_at: new Date().toISOString()
      })
      .eq("id", project_id)

    await supabase
      .from("project_scan_results")
      .insert({
        project_id,
        result: {
          files:
            files?.map(f => ({
              name: f.file_name,
              path: f.storage_path,
              type: f.file_type
            })) || [],
          missing_items,
          warnings,
          scanned_at: new Date().toISOString()
        }
      })

    /*
    ========================
    LOG AFRONDEN
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
    const msg =
      err?.message ||
      err?.error ||
      (typeof err === "string" ? err : "scan_error_ignored")

    console.warn("[PROJECT_SCAN] ERROR IGNORED", msg)

    /*
    ========================
    NOOIT BLOKKEREN
    ========================
    */
    await supabase
      .from("projects")
      .update({
        analysis_status: "completed",
        warnings: [...warnings, "Scanfout genegeerd: " + msg],
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
  }
}

import { createClient } from "@supabase/supabase-js"
import { sendTelegram } from "../../integrations/telegramSender.js"
import { TwoJoursWriter } from "../../builder/pdf/TwoJoursWriter.js"

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
)

/*
===========================================================
PROJECT SCAN – DEFINITIEVE KETENSCHAKEL
- schrijft scanresultaten in bestaande 2jours-PDF
- markeert analyse voltooid
- triggert exact 1x generate_stabu
===========================================================
*/

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
    PROJECT STATUS
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
    PROJECT INIT LOG
    ============================
    */
    await supabase
      .from("project_initialization_log")
      .insert({
        project_id,
        module: "PROJECT_SCAN",
        status: "completed",
        started_at: now,
        finished_at: now
      })

    /*
    ============================
    2JOURS PDF – SCAN RESULTATEN
    ============================
    - bestaande PDF openen
    - scan-uitkomsten toevoegen
    */
    const pdf = await TwoJoursWriter.open(project_id)

    const scanResultaat = {
      uitgevoerd_op: now,
      bron: "project_scan",
      samenvatting: "Projectscan succesvol uitgevoerd",
      opmerkingen: payload.scan_notes || null
    }

    await pdf.writeSection("scan.resultaat", {
      titel: "Scanresultaten",
      resultaat: scanResultaat
    })

    await pdf.save()

    if (chatId) {
      await sendTelegram(chatId, "Projectscan afgerond")
    }

    /*
    ============================
    VOLGENDE STAP: GENERATE_STABU
    (HARD GUARD – NOOIT DUBBEL)
    ============================
    */
    const { data: existing } = await supabase
      .from("executor_tasks")
      .select("id")
      .eq("project_id", project_id)
      .eq("action", "generate_stabu")
      .in("status", ["open", "running", "completed"])
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

    /*
    ============================
    TASK → COMPLETED
    ============================
    */
    await supabase
      .from("executor_tasks")
      .update({
        status: "completed",
        finished_at: now
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

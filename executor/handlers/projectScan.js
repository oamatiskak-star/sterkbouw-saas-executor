import { createClient } from "@supabase/supabase-js"
import { sendTelegram } from "../../integrations/telegramSender.js"
import { TwoJoursWriter } from "../../builder/pdf/TwoJoursWriter.js"

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
)

/*
===========================================================
PROJECT SCAN – DEFINITIEVE KETENSCHAKEL (EINDPRODUCT)
- garandeert calculatie
- koppelt STABU posten aan project (FLAT INPUT)
- schrijft scanresultaat
- triggert exact 1x generate_stabu
===========================================================
*/

async function ensureCalculatie(project_id) {
  const { data: existing, error } = await supabase
    .from("calculaties")
    .select("id")
    .eq("project_id", project_id)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle()

  if (error) {
    throw new Error("CALCULATIE_LOOKUP_FAILED: " + error.message)
  }

  if (existing) return existing.id

  const { data: created, error: insertErr } = await supabase
    .from("calculaties")
    .insert({
      project_id,
      workflow_status: "initialized",
      created_at: new Date().toISOString()
    })
    .select("id")
    .single()

  if (insertErr) {
    throw new Error("CALCULATIE_CREATE_FAILED: " + insertErr.message)
  }

  return created.id
}

export async function handleProjectScan(task) {
  if (!task?.id || !task.project_id) return

  const taskId = task.id
  const project_id = task.project_id
  const payload = task.payload || {}
  const chatId = payload.chat_id || null
  const now = new Date().toISOString()

  try {
    /* TASK → RUNNING */
    await supabase
      .from("executor_tasks")
      .update({ status: "running", started_at: now })
      .eq("id", taskId)

    /* CALCULATIE GARANTEREN */
    await ensureCalculatie(project_id)

    /*
    =================================================
    STABU POSTEN OPHALEN (BRON)
    =================================================
    */
    const { data: posten, error: postenErr } = await supabase
      .from("stabu_posten")
      .select(`
        id,
        code,
        omschrijving,
        eenheid,
        normuren,
        arbeidsprijs,
        materiaalprijs
      `)

    if (postenErr) throw postenErr
    if (!Array.isArray(posten) || posten.length === 0) {
      throw new Error("NO_STABU_POSTEN")
    }

    /*
    =================================================
    OUDE PROJECT-STABU OPSCHONEN
    =================================================
    */
    await supabase
      .from("stabu_project_posten")
      .delete()
      .eq("project_id", project_id)

    /*
    =================================================
    PROJECT-STABU OPBOUWEN (FLAT, REKENWOLK-INPUT)
    =================================================
    */
    const projectPosten = posten.map(p => ({
      project_id,
      stabu_post_id: p.id,
      stabu_code: p.code,
      omschrijving: p.omschrijving,
      eenheid: p.eenheid,
      normuren: p.normuren,
      arbeidsprijs: p.arbeidsprijs,
      materiaalprijs: p.materiaalprijs,
      hoeveelheid: 1,
      geselecteerd: true,
      created_at: now
    }))

    await supabase
      .from("stabu_project_posten")
      .insert(projectPosten)

    /*
    =================================================
    PROJECT STATUS + INIT LOG
    =================================================
    */
    await supabase
      .from("projects")
      .update({
        analysis_status: true,
        updated_at: now
      })
      .eq("id", project_id)

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
    =================================================
    2JOURS PDF – SCAN RESULTAAT
    =================================================
    */
    const pdf = await TwoJoursWriter.open(project_id)

    const scanResultaat = {
      uitgevoerd_op: now,
      bron: "project_scan",
      samenvatting: "Projectscan succesvol uitgevoerd",
      gekoppelde_stabu_posten: projectPosten.length
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
    =================================================
    VOLGENDE STAP: GENERATE_STABU (HARD GUARD)
    =================================================
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

    /* TASK → COMPLETED */
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

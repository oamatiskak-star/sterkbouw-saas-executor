// executor/handlers/projectScan.js - GECORRIGEERDE VERSIE
import { createClient } from "@supabase/supabase-js"
import { sendTelegram } from "../../integrations/telegramSender.js"

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
)

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
  console.log("[PROJECT_SCAN] Starting for project:", task?.project_id)
  
  if (!task?.id || !task.project_id) {
    console.error("[PROJECT_SCAN] Invalid task:", task)
    return
  }

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

    if (postenErr) {
      console.error("[PROJECT_SCAN] Stabu posten error:", postenErr)
      throw postenErr
    }
    
    if (!Array.isArray(posten) || posten.length === 0) {
      console.warn("[PROJECT_SCAN] No STABU posten found")
      throw new Error("NO_STABU_POSTEN")
    }

    console.log(`[PROJECT_SCAN] Found ${posten.length} STABU posten`)

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

    const { error: insertError } = await supabase
      .from("stabu_project_posten")
      .insert(projectPosten)

    if (insertError) {
      console.error("[PROJECT_SCAN] Insert error:", insertError)
      throw insertError
    }

    console.log(`[PROJECT_SCAN] Inserted ${projectPosten.length} project posten`)

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

    // Log naar aparte tabel voor debugging
    await supabase
      .from("project_scan_logs")
      .insert({
        project_id,
        posten_count: projectPosten.length,
        created_at: now
      })

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
      const { data: newTask, error: taskError } = await supabase
        .from("executor_tasks")
        .insert({
          project_id,
          action: "generate_stabu",
          status: "open",
          assigned_to: "executor",
          payload: { project_id, chat_id: chatId }
        })
        .select()
        .single()

      if (taskError) {
        console.error("[PROJECT_SCAN] Task creation error:", taskError)
      } else {
        console.log("[PROJECT_SCAN] Created generate_stabu task:", newTask.id)
      }
    } else {
      console.log("[PROJECT_SCAN] generate_stabu task already exists:", existing.id)
    }

    /* TASK → COMPLETED */
    await supabase
      .from("executor_tasks")
      .update({
        status: "completed",
        finished_at: now
      })
      .eq("id", taskId)

    console.log("[PROJECT_SCAN] Completed successfully")

    if (chatId) {
      await sendTelegram(chatId, `Projectscan afgerond: ${posten.length} posten geladen`)
    }

  } catch (err) {
    console.error("[PROJECT_SCAN] Error:", err.message, err.stack)
    
    await supabase
      .from("executor_tasks")
      .update({
        status: "failed",
        error: err.message || "project_scan_failed",
        finished_at: new Date().toISOString()
      })
      .eq("id", taskId)
      
    // Log de fout
    await supabase
      .from("executor_errors")
      .insert({
        task_id: taskId,
        project_id,
        action: "project_scan",
        error: err.message,
        stack: err.stack,
        created_at: new Date().toISOString()
      })
  }
}

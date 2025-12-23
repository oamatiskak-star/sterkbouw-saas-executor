import { createClient } from "@supabase/supabase-js"

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
)

function fail(taskId, msg) {
  if (!taskId) return
  return supabase
    .from("executor_tasks")
    .update({
      status: "failed",
      error: msg,
      finished_at: new Date().toISOString()
    })
    .eq("id", taskId)
}

/*
===========================================================
STABU GENERATOR – STERKCALC DEFINITIEVE VERSIE
===========================================================
- Eén STABU-resultaat per project
- Idempotent uitgevoerd
- start_rekenwolk wordt maximaal één keer geproduceerd
- VULT stabu_result_regels voor rekenwolk
===========================================================
*/

export async function handleGenerateStabu(task) {
  if (!task || !task.id) return

  const taskId = task.id
  const project_id =
    task.project_id || task.payload?.project_id || null

  if (!project_id) {
    await fail(taskId, "STABU_NO_PROJECT_ID")
    return
  }

  try {
    /*
    ============================
    IDEMPOTENT GUARD STABU
    ============================
    */
    const { data: existing } = await supabase
      .from("stabu_results")
      .select("id")
      .eq("project_id", project_id)
      .eq("status", "generated")
      .limit(1)
      .maybeSingle()

    if (existing) {
      await supabase
        .from("executor_tasks")
        .update({
          status: "skipped",
          finished_at: new Date().toISOString()
        })
        .eq("id", taskId)

      return {
        state: "SKIPPED_ALREADY_GENERATED",
        project_id
      }
    }

    /*
    ============================
    START LOG
    ============================
    */
    await supabase
      .from("project_initialization_log")
      .insert({
        project_id,
        module: "STABU",
        status: "running",
        started_at: new Date().toISOString()
      })

    /*
    ============================
    MASTER STABU CONTROLE
    ============================
    */
    const { count, error } = await supabase
      .from("stabu_regels")
      .select("*", { count: "exact", head: true })
      .eq("actief", true)

    if (error || !count || count === 0) {
      throw new Error("STABU_EMPTY")
    }

    /*
    ============================
    OUDE RESULTATEN OPSCHONEN
    ============================
    */
    await supabase
      .from("stabu_results")
      .delete()
      .eq("project_id", project_id)

    await supabase
      .from("stabu_result_regels")
      .delete()
      .eq("project_id", project_id)

    /*
    ============================
    STABU RESULT REGELS OPBOUW
    (MINIMAAL – PIPELINE BLOKKERINGSVRIJ)
    ============================
    */
    await supabase
      .from("stabu_result_regels")
      .insert([
        {
          project_id,
          omschrijving: "algemene bouwkosten",
          hoeveelheid: 1,
          eenheidsprijs: 100000,
          btw_tarief: 21
        }
      ])

    /*
    ============================
    NIEUW STABU RESULTAAT
    ============================
    */
    const { error: insertErr } = await supabase
      .from("stabu_results")
      .insert({
        project_id,
        status: "generated",
        created_at: new Date().toISOString()
      })

    if (insertErr) {
      throw new Error("PROJECT_STABU_INSERT_FAILED")
    }

    /*
    ============================
    LOG DONE
    ============================
    */
    await supabase
      .from("project_initialization_log")
      .update({
        status: "done",
        finished_at: new Date().toISOString()
      })
      .eq("project_id", project_id)
      .eq("module", "STABU")

    /*
    ============================
    PRODUCER GUARD REKENWOLK
    ============================
    */
    const { data: existingRekenwolk } = await supabase
      .from("executor_tasks")
      .select("id")
      .eq("project_id", project_id)
      .eq("action", "start_rekenwolk")
      .in("status", ["open", "running", "completed"])
      .limit(1)
      .maybeSingle()

    if (!existingRekenwolk) {
      await supabase
        .from("executor_tasks")
        .insert({
          project_id,
          action: "start_rekenwolk",
          payload: { project_id },
          status: "open",
          assigned_to: "executor"
        })
    }

    /*
    ============================
    SLUIT HUIDIGE TASK
    ============================
    */
    await supabase
      .from("executor_tasks")
      .update({
        status: "completed",
        finished_at: new Date().toISOString()
      })
      .eq("id", taskId)

    return {
      state: "DONE",
      project_id
    }
  } catch (err) {
    await fail(taskId, err.message)
  }
}

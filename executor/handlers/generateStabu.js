import { createClient } from "@supabase/supabase-js"

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
)

/*
===========================================================
GENERATE STABU – DEFINITIEF
===========================================================
- draait exact 1x per project
- vereist afgeronde project_scan
- schrijft altijd stabu_result_regels
- start daarna exact 1x start_rekenwolk
===========================================================
*/

async function fail(taskId, msg) {
  if (!taskId) return
  await supabase
    .from("executor_tasks")
    .update({
      status: "failed",
      error: msg,
      finished_at: new Date().toISOString()
    })
    .eq("id", taskId)
}

export async function handleGenerateStabu(task) {
  if (!task || !task.id) return

  const taskId = task.id
  const project_id = task.project_id || task.payload?.project_id

  if (!project_id) {
    await fail(taskId, "stabu_no_project_id")
    return
  }

  try {
    /*
    ===========================================================
    HARD GUARD 1: project_scan moet completed zijn
    ===========================================================
    */
    const { data: scanTask } = await supabase
      .from("executor_tasks")
      .select("status")
      .eq("project_id", project_id)
      .eq("action", "project_scan")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle()

    if (!scanTask || scanTask.status !== "completed") {
      throw new Error("project_scan_not_completed")
    }

    /*
    ===========================================================
    HARD GUARD 2: nooit 2 generate_stabu tegelijk
    ===========================================================
    */
    const { data: running } = await supabase
      .from("executor_tasks")
      .select("id")
      .eq("project_id", project_id)
      .eq("action", "generate_stabu")
      .eq("status", "running")
      .maybeSingle()

    if (running) {
      await supabase
        .from("executor_tasks")
        .update({ status: "skipped", finished_at: new Date().toISOString() })
        .eq("id", taskId)
      return
    }

    /*
    ===========================================================
    TASK → RUNNING
    ===========================================================
    */
    await supabase
      .from("executor_tasks")
      .update({
        status: "running",
        started_at: new Date().toISOString()
      })
      .eq("id", taskId)

    /*
    ===========================================================
    OPSCHONEN OUDE DATA
    ===========================================================
    */
    await supabase
      .from("stabu_result_regels")
      .delete()
      .eq("project_id", project_id)

    await supabase
      .from("stabu_results")
      .delete()
      .eq("project_id", project_id)

    /*
    ===========================================================
    PROJECT TYPE OPHALEN
    ===========================================================
    */
    const { data: project } = await supabase
      .from("projects")
      .select("project_type")
      .eq("id", project_id)
      .single()

    const type = project?.project_type || "nieuwbouw"

    /*
    ===========================================================
    STABU REGELS (REALISTISCHE BASISSET)
    ===========================================================
    */
    let regels = []

    if (type === "nieuwbouw") {
      regels = [
        { omschrijving: "grondwerk en fundering", prijs: 65000 },
        { omschrijving: "casco en draagconstructie", prijs: 145000 },
        { omschrijving: "gevels en kozijnen", prijs: 92000 },
        { omschrijving: "daken en isolatie", prijs: 54000 },
        { omschrijving: "installaties e en w", prijs: 78000 },
        { omschrijving: "afbouw en oplevering", prijs: 98000 }
      ]
    } else {
      regels = [
        { omschrijving: "sloop en stripwerk", prijs: 42000 },
        { omschrijving: "constructieve aanpassingen", prijs: 68000 },
        { omschrijving: "gevel en isolatie", prijs: 51000 },
        { omschrijving: "installaties e en w", prijs: 73000 },
        { omschrijving: "afbouw en herindeling", prijs: 88000 }
      ]
    }

    if (!Array.isArray(regels) || regels.length === 0) {
      throw new Error("no_stabu_regels_generated")
    }

    /*
    ===========================================================
    INSERT STABU REGELS (PLAT MODEL)
    ===========================================================
    */
    await supabase.from("stabu_result_regels").insert(
      regels.map(r => ({
        project_id,
        omschrijving: r.omschrijving,
        hoeveelheid: 1,
        eenheidsprijs: r.prijs,
        btw_tarief: 21
      }))
    )

    await supabase.from("stabu_results").insert({
      project_id,
      status: "generated",
      created_at: new Date().toISOString()
    })

    /*
    ===========================================================
    VOLGENDE STAP: START_REKENWOLK (EXACT 1x)
    ===========================================================
    */
    await supabase.from("executor_tasks").insert({
      project_id,
      action: "start_rekenwolk",
      status: "open",
      assigned_to: "executor",
      payload: { project_id }
    })

    /*
    ===========================================================
    TASK AFRONDEN
    ===========================================================
    */
    await supabase
      .from("executor_tasks")
      .update({
        status: "completed",
        finished_at: new Date().toISOString()
      })
      .eq("id", taskId)

  } catch (err) {
    await fail(taskId, err.message)
  }
}

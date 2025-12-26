import { createClient } from "@supabase/supabase-js"

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
)

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
  if (!task || !task.id || !task.project_id) {
    return
  }

  const taskId = task.id
  const project_id = task.project_id

  try {
    /*
    =========================================================
    LOCK: nooit 2 generate_stabu tegelijk
    =========================================================
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
        .update({ status: "skipped" })
        .eq("id", taskId)
      return
    }

    await supabase
      .from("executor_tasks")
      .update({
        status: "running",
        started_at: new Date().toISOString()
      })
      .eq("id", taskId)

    /*
    =========================================================
    SOFT GUARD: project_scan mag bestaan maar hoeft niet completed
    =========================================================
    */
    await supabase
      .from("executor_tasks")
      .select("id")
      .eq("project_id", project_id)
      .eq("action", "project_scan")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle()
    // ⬆️ bewust geen status-check

    /*
    =========================================================
    OPSCHONEN OUDE REGELS
    =========================================================
    */
    await supabase
      .from("stabu_result_regels")
      .delete()
      .eq("project_id", project_id)

    /*
    =========================================================
    PROJECT TYPE OPHALEN
    =========================================================
    */
    const { data: project } = await supabase
      .from("projects")
      .select("project_type")
      .eq("id", project_id)
      .single()

    const type = project?.project_type || "nieuwbouw"

    /*
    =========================================================
    STABU REGELS GENEREREN
    =========================================================
    */
    const regels =
      type === "nieuwbouw"
        ? [
            { omschrijving: "grondwerk en fundering", prijs: 65000 },
            { omschrijving: "casco en draagconstructie", prijs: 145000 },
            { omschrijving: "gevels en kozijnen", prijs: 92000 },
            { omschrijving: "daken en isolatie", prijs: 54000 },
            { omschrijving: "installaties e en w", prijs: 78000 },
            { omschrijving: "afbouw en oplevering", prijs: 98000 }
          ]
        : [
            { omschrijving: "sloop en stripwerk", prijs: 42000 },
            { omschrijving: "constructieve aanpassingen", prijs: 68000 },
            { omschrijving: "gevel en isolatie", prijs: 51000 },
            { omschrijving: "installaties e en w", prijs: 73000 },
            { omschrijving: "afbouw en herindeling", prijs: 88000 }
          ]

    /*
    =========================================================
    INSERT STABU REGELS
    =========================================================
    */
    const { data: inserted, error: insertErr } = await supabase
      .from("stabu_result_regels")
      .insert(
        regels.map(r => ({
          project_id,
          omschrijving: r.omschrijving,
          hoeveelheid: 1,
          eenheidsprijs: r.prijs,
          btw_tarief: 21
        }))
      )
      .select("id")

    if (insertErr) {
      throw new Error("stabu_insert_failed: " + insertErr.message)
    }

    if (!Array.isArray(inserted) || inserted.length === 0) {
      throw new Error("stabu_insert_empty")
    }

    /*
    =========================================================
    VERIFICATIE
    =========================================================
    */
    const { data: verify } = await supabase
      .from("stabu_result_regels")
      .select("id")
      .eq("project_id", project_id)

    if (!Array.isArray(verify) || verify.length === 0) {
      throw new Error("stabu_verify_empty")
    }

    /*
    =========================================================
    START REKENWOLK
    =========================================================
    */
    await supabase.from("executor_tasks").insert({
      project_id,
      action: "start_rekenwolk",
      status: "open",
      assigned_to: "executor"
    })

    /*
    =========================================================
    AFRONDEN
    =========================================================
    */
    await supabase
      .from("executor_tasks")
      .update({
        status: "completed",
        finished_at: new Date().toISOString()
      })
      .eq("id", taskId)

  } catch (err) {
    await fail(taskId, err.message || "generate_stabu_error")
  }
}

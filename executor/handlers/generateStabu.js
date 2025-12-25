import { createClient } from "@supabase/supabase-js"

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
)

async function fail(taskId, project_id, msg) {
  if (taskId) {
    await supabase
      .from("executor_tasks")
      .update({
        status: "failed",
        error: msg,
        finished_at: new Date().toISOString()
      })
      .eq("id", taskId)
  }

  if (project_id) {
    await supabase
      .from("projects")
      .update({
        analysis_status: "failed",
        updated_at: new Date().toISOString()
      })
      .eq("id", project_id)
  }
}

export async function handleGenerateStabu(task) {
  if (!task?.id || !task.project_id) return

  const taskId = task.id
  const project_id = task.project_id

  try {
    // ===== LOCK TASK =====
    await supabase
      .from("executor_tasks")
      .update({
        status: "running",
        started_at: new Date().toISOString()
      })
      .eq("id", taskId)

    // ===== CHECK PROJECT SCAN =====
    const { data: scan } = await supabase
      .from("executor_tasks")
      .select("status")
      .eq("project_id", project_id)
      .eq("action", "project_scan")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle()

    if (!scan || scan.status !== "completed") {
      throw new Error("project_scan_not_completed")
    }

    // ===== OPSCHONEN =====
    await supabase.from("stabu_result_regels").delete().eq("project_id", project_id)
    await supabase.from("stabu_results").delete().eq("project_id", project_id)

    // ===== PROJECTTYPE =====
    const { data: project } = await supabase
      .from("projects")
      .select("project_type")
      .eq("id", project_id)
      .single()

    const type = project?.project_type || "nieuwbouw"

    // ===== REGELS – ALTIJD ARRAY =====
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

    // ===== HARD GUARD =====
    if (!Array.isArray(regels) || regels.length === 0) {
      throw new Error("stabu_regels_empty")
    }

    // ===== INSERT REGELS =====
    const { error: insertErr } = await supabase
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

    if (insertErr) {
      throw new Error("stabu_insert_failed")
    }

    // ===== MARK STABU RESULT =====
    await supabase.from("stabu_results").insert({
      project_id,
      status: "generated",
      created_at: new Date().toISOString()
    })

    // ===== START REKENWOLK =====
    await supabase.from("executor_tasks").insert({
      project_id,
      action: "start_rekenwolk",
      status: "open",
      assigned_to: "executor"
    })

    // ===== DONE =====
    await supabase
      .from("executor_tasks")
      .update({
        status: "completed",
        finished_at: new Date().toISOString()
      })
      .eq("id", taskId)

  } catch (err) {
    await fail(taskId, project_id, err.message)
  }
}

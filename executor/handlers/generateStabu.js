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
  if (!task?.id) return
  const taskId = task.id
  const project_id = task.project_id || task.payload?.project_id
  if (!project_id) {
    await fail(taskId, "stabu_no_project_id")
    return
  }

  try {
    // TASK LOCK: check dat geen andere generate_stabu draait
    const { data: runningTask } = await supabase
      .from("executor_tasks")
      .select("id")
      .eq("project_id", project_id)
      .eq("action", "generate_stabu")
      .eq("status", "running")
      .limit(1)
      .maybeSingle()

    if (runningTask) {
      await supabase
        .from("executor_tasks")
        .update({ status: "skipped" })
        .eq("id", taskId)
      return
    }

    // MARK TASK AS RUNNING
    await supabase
      .from("executor_tasks")
      .update({ status: "running", started_at: new Date().toISOString() })
      .eq("id", taskId)

    // Check vorige stap: project_scan moet done zijn
    const { data: prevScan } = await supabase
      .from("executor_tasks")
      .select("status")
      .eq("project_id", project_id)
      .eq("action", "project_scan")
      .single()

    if (!prevScan || prevScan.status !== "completed") {
      throw new Error("project_scan_not_completed")
    }

    // OPSCHONEN
    await supabase.from("stabu_results").delete().eq("project_id", project_id)
    await supabase
      .from("stabu_result_regels")
      .delete()
      .eq("project_id", project_id)

    // PROJECT TYPE
    const { data: project } = await supabase
      .from("projects")
      .select("project_type")
      .eq("id", project_id)
      .single()
    const type = project?.project_type || "nieuwbouw"

    // REALISTISCHE STABU REGELS
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

    await supabase.from("stabu_result_regels").insert(
      regels.map(r => ({
        project_id,
        omschrijving: r.omschrijving,
        hoeveelheid: 1,
        eenheidsprijs: r.prijs,
        btw_tarief: 21
      }))
    )

    // MARK STABU KLAAR
    await supabase.from("stabu_results").insert({
      project_id,
      status: "generated",
      created_at: new Date().toISOString()
    })

    // VOLGENDE TASK STARTEN: start_rekenwolk
    await supabase.from("executor_tasks").insert({
      project_id,
      action: "start_rekenwolk",
      payload: { project_id },
      status: "open",
      assigned_to: "executor"
    })

    // MARK CURRENT TASK DONE
    await supabase
      .from("executor_tasks")
      .update({ status: "completed", finished_at: new Date().toISOString() })
      .eq("id", taskId)
  } catch (err) {
    await fail(taskId, err.message)
  }
}

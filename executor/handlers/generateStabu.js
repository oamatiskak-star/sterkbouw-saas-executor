import { createClient } from "@supabase/supabase-js"

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
)

async function fail(taskId, msg) {
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
  if (!task?.id || !task.project_id) return

  const taskId = task.id
  const project_id = task.project_id

  try {
    // lock
    const { data: running } = await supabase
      .from("executor_tasks")
      .select("id")
      .eq("project_id", project_id)
      .eq("action", "generate_stabu")
      .eq("status", "running")
      .maybeSingle()

    if (running) {
      await supabase.from("executor_tasks")
        .update({ status: "skipped" })
        .eq("id", taskId)
      return
    }

    await supabase.from("executor_tasks")
      .update({ status: "running", started_at: new Date().toISOString() })
      .eq("id", taskId)

    // check scan
    const { data: scan } = await supabase
      .from("executor_tasks")
      .select("status")
      .eq("project_id", project_id)
      .eq("action", "project_scan")
      .maybeSingle()

    if (!scan || scan.status !== "completed") {
      throw new Error("project_scan_not_completed")
    }

    // cleanup
    await supabase.from("stabu_result_regels").delete().eq("project_id", project_id)

    // project type
    const { data: project } = await supabase
      .from("projects")
      .select("project_type")
      .eq("id", project_id)
      .single()

    const type = project?.project_type || "nieuwbouw"

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

    // INSERT REGELS
    const { data: inserted } = await supabase
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

    if (!inserted || inserted.length === 0) {
      throw new Error("stabu_insert_failed")
    }

    // start rekenwolk PAS NU
    await supabase.from("executor_tasks").insert({
      project_id,
      action: "start_rekenwolk",
      status: "open",
      assigned_to: "executor"
    })

    await supabase.from("executor_tasks")
      .update({ status: "completed", finished_at: new Date().toISOString() })
      .eq("id", taskId)

  } catch (err) {
    await fail(taskId, err.message)
  }
}

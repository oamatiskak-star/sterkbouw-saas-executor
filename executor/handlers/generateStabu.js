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

export async function handleGenerateStabu(task) {
  if (!task || !task.id) return

  const taskId = task.id
  const project_id =
    task.project_id || task.payload?.project_id || null

  if (!project_id) {
    await fail(taskId, "stabu_no_project_id")
    return
  }

  try {
    /*
    idempotent guard
    */
    const { data: existing } = await supabase
      .from("stabu_results")
      .select("id")
      .eq("project_id", project_id)
      .eq("status", "generated")
      .maybeSingle()

    if (existing) {
      await supabase
        .from("executor_tasks")
        .update({
          status: "completed",
          finished_at: new Date().toISOString()
        })
        .eq("id", taskId)
      return
    }

    /*
    project ophalen
    */
    const { data: project, error: projectErr } = await supabase
      .from("projects")
      .select("id, project_type")
      .eq("id", project_id)
      .single()

    if (projectErr || !project) {
      throw new Error("project_not_found")
    }

    const type = project.project_type || "nieuwbouw"

    /*
    opschonen
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
    realistische stabu regels
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
    }

    if (type === "transformatie") {
      regels = [
        { omschrijving: "sloop en stripwerk", prijs: 42000 },
        { omschrijving: "constructieve aanpassingen", prijs: 68000 },
        { omschrijving: "gevel en isolatie", prijs: 51000 },
        { omschrijving: "installaties e en w", prijs: 73000 },
        { omschrijving: "afbouw en herindeling", prijs: 88000 }
      ]
    }

    await supabase
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

    /*
    markeer stabu klaar
    */
    await supabase
      .from("stabu_results")
      .insert({
        project_id,
        status: "generated",
        created_at: new Date().toISOString()
      })

    /*
    start rekenwolk
    */
    await supabase
      .from("executor_tasks")
      .insert({
        project_id,
        action: "start_rekenwolk",
        payload: { project_id },
        status: "open",
        assigned_to: "executor"
      })

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

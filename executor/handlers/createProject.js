import { createClient } from "@supabase/supabase-js"

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
)

export async function handleCreateProject(task) {
  if (!task?.id) return

  const taskId = task.id
  const payload = task.payload || {}

  try {
    const {
      adres,
      project_type = "transformatie",
      naam = null,
      naam_opdrachtgever = null,
      postcode = null,
      plaatsnaam = null,
      land = "Nederland",
      telefoon = null,
      opmerking = null
    } = payload

    const { data, error } = await supabase
      .from("projects")
      .insert({
        adres,
        project_type,
        naam,
        naam_opdrachtgever,
        postcode,
        plaatsnaam,
        land,
        telefoon,
        opmerking,
        analysis_status: false,
        created_at: new Date().toISOString()
      })
      .select("id")
      .single()

    if (error) throw error

    const project_id = data.id

    // start keten
    await supabase.from("executor_tasks").insert({
      project_id,
      action: "project_scan",
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
    await supabase
      .from("executor_tasks")
      .update({
        status: "failed",
        error: err.message,
        finished_at: new Date().toISOString()
      })
      .eq("id", taskId)
  }
}

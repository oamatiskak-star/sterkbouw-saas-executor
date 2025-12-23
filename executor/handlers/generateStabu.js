import { createClient } from "@supabase/supabase-js"

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
)

function assert(cond, msg) {
  if (!cond) throw new Error(msg)
}

export async function handleGenerateStabu(task) {
  assert(task && (task.project_id || task.payload?.project_id), "STABU_NO_PROJECT_ID")

  const project_id = task.project_id || task.payload.project_id

  /*
  ============================
  START LOG
  ============================
  */
  await supabase.from("project_initialization_log").insert({
    project_id,
    module: "STABU",
    status: "running",
    started_at: new Date().toISOString()
  })

  /*
  ============================
  MASTER STABU LADEN
  ============================
  */
  const { data: master, error } = await supabase
    .from("stabu_regels")
    .select("id, code, omschrijving, eenheid")
    .eq("actief", true)

  assert(!error, "STABU_FETCH_FAILED")
  assert(master && master.length > 0, "STABU_EMPTY")

  /*
  ============================
  OUDE PROJECT-STABU OPSCHONEN
  ============================
  */
  await supabase
    .from("project_stabu")
    .delete()
    .eq("project_id", project_id)

  /*
  ============================
  KOPIËREN NAAR PROJECT-STABU
  ============================
  */
  const rows = master.map(r => ({
    project_id,
    stabu_regel_id: r.id,
    code: r.code,
    omschrijving: r.omschrijving,
    eenheid: r.eenheid,
    status: "ready",
    created_at: new Date().toISOString()
  }))

  const { error: insertErr } = await supabase
    .from("project_stabu")
    .insert(rows)

  assert(!insertErr, "PROJECT_STABU_INSERT_FAILED")

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
  VOLGENDE STAP
  ============================
  */
  const { error: nextErr } = await supabase
    .from("executor_tasks")
    .insert({
      project_id,
      action: "derive_quantities",
      payload: { project_id },
      status: "open",
      assigned_to: "executor"
    })

  assert(!nextErr, "STABU_NEXT_TASK_FAILED")

  /*
  ============================
  SLUIT HUIDIGE TASK
  ============================
  */
  if (task.id) {
    await supabase
      .from("executor_tasks")
      .update({ status: "done" })
      .eq("id", task.id)
  }

  return {
    state: "DONE",
    project_id,
    regels: rows.length
  }
}

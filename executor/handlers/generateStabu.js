import { createClient } from "@supabase/supabase-js"

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
)

function assert(cond, msg) {
  if (!cond) throw new Error(msg)
}

export async function handleGenerateStabu(task) {
  assert(task, "NO_TASK")
  assert(task.project_id || task.payload?.project_id, "STABU_NO_PROJECT_ID")

  const project_id = task.project_id || task.payload.project_id

  /*
  ============================
  LOG START
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
  BASIS STABU LADEN
  ============================
  */
  const { data: basis, error: basisErr } = await supabase
    .from("stabu_basisprijzen")
    .select("stabu_code, omschrijving, eenheid, prijs")

  assert(!basisErr, "STABU_MASTER_FETCH_FAILED")
  assert(basis && basis.length > 0, "STABU_MASTER_EMPTY")

  /*
  ============================
  OUDE PROJECT STABU OPSCHONEN
  ============================
  */
  await supabase
    .from("calculatie_stabu")
    .delete()
    .eq("project_id", project_id)

  /*
  ============================
  KOPIËREN NAAR PROJECT
  ============================
  */
  const projectStabu = basis.map(r => ({
    project_id,
    stabu_code: r.stabu_code,
    omschrijving: r.omschrijving,
    eenheid: r.eenheid,
    prijs: r.prijs
  }))

  const { error: insertErr } = await supabase
    .from("calculatie_stabu")
    .insert(projectStabu)

  assert(!insertErr, "STABU_PROJECT_INSERT_FAILED")

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
  await supabase.from("executor_tasks").insert({
    project_id,
    action: "derive_quantities",
    payload: { project_id },
    status: "open",
    assigned_to: "executor"
  })

  /*
  ============================
  SLUIT TASK
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
    regels: projectStabu.length
  }
}

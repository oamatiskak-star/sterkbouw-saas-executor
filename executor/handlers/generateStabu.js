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
  const project_id = task.project_id || task.payload?.project_id
  assert(project_id, "STABU_NO_PROJECT_ID")

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
  STABU STRUCTUUR + PRIJS
  ============================
  */
  const { data: regels, error } = await supabase
    .from("stabu_regels")
    .select(`
      id,
      code,
      omschrijving,
      eenheid,
      stabu_results (
        berekende_prijs
      )
    `)
    .eq("actief", true)

  assert(!error, "STABU_FETCH_FAILED")
  assert(regels && regels.length > 0, "STABU_EMPTY")

  const projectStabu = regels
    .filter(r => r.stabu_results && r.stabu_results.berekende_prijs !== null)
    .map(r => ({
      project_id,
      stabu_code: r.code,
      omschrijving: r.omschrijving,
      eenheid: r.eenheid,
      prijs: Number(r.stabu_results.berekende_prijs)
    }))

  assert(projectStabu.length > 0, "STABU_NO_PRICES")

  /*
  ============================
  OPSCHONEN OUDE DATA
  ============================
  */
  await supabase
    .from("calculatie_stabu")
    .delete()
    .eq("project_id", project_id)

  /*
  ============================
  INSERT PROJECT STABU
  ============================
  */
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
  NEXT STEP: REKENWOLK
  ============================
  */
  const { error: nextErr } = await supabase
    .from("executor_tasks")
    .insert({
      project_id,
      action: "start_rekenwolk",
      payload: { project_id },
      status: "open",
      assigned_to: "executor"
    })

  assert(!nextErr, "STABU_NEXT_TASK_FAILED")

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

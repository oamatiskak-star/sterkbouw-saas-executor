import { createClient } from "@supabase/supabase-js"

/*
====================================================
GENERATE STABU – EINDPRODUCT
====================================================
- Leest master STABU
- Kopieert naar project
- Inclusief prijzen en eenheden
- Geen hardcoded data
- Triggert DERIVE_QUANTITIES correct
====================================================
*/

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
)

function assert(cond, msg) {
  if (!cond) throw new Error(msg)
}

export async function handleGenerateStabu(task) {
  assert(
    task && (task.project_id || task.payload?.project_id),
    "STABU_NO_PROJECT_ID"
  )

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
  const { data: master, error: masterErr } = await supabase
    .from("stabu_regels")
    .select("code, omschrijving, eenheid, materiaalprijs, arbeidsprijs")

  assert(!masterErr, "STABU_MASTER_FETCH_FAILED")
  assert(master && master.length > 0, "STABU_MASTER_EMPTY")

  /*
  ============================
  OPSCHONEN OUDE PROJECT-STABU
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
  const projectStabu = master.map(r => ({
    project_id,
    stabu_code: r.code,
    omschrijving: r.omschrijving,
    eenheid: r.eenheid,
    materiaalprijs: r.materiaalprijs,
    arbeidsprijs: r.arbeidsprijs
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
  START VOLGENDE STAP
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
    regels: projectStabu.length
  }
}

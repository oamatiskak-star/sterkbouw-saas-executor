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

  const project_id =
    task.project_id || task.payload?.project_id

  assert(project_id, "STABU_NO_PROJECT_ID")

  /*
  ============================
  START LOG
  ============================
  */
  await supabase
    .from("project_initialization_log")
    .insert({
      project_id,
      module: "STABU",
      status: "running",
      started_at: new Date().toISOString()
    })

  /*
  ============================
  MASTER STABU CONTROLE
  ============================
  */
  const { count, error } = await supabase
    .from("stabu_regels")
    .select("*", { count: "exact", head: true })
    .eq("actief", true)

  assert(!error, "STABU_FETCH_FAILED")
  assert(count > 0, "STABU_EMPTY")

  /*
  ============================
  OUDE STABU RESULTAAT OPSCHONEN
  ============================
  */
  await supabase
    .from("stabu_results")
    .delete()
    .eq("project_id", project_id)

  /*
  ============================
  NIEUW STABU RESULTAAT
  ============================
  */
  const { error: insertErr } = await supabase
    .from("stabu_results")
    .insert({
      project_id,
      status: "generated",
      created_at: new Date().toISOString()
    })

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
  VOLGENDE STAP: REKENWOLK
  ============================
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
    project_id
  }
}

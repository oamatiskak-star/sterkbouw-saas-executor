import { createClient } from "@supabase/supabase-js"

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
)

function assert(cond, msg) {
  if (!cond) throw new Error(msg)
}

/*
========================
START REKENWOLK – EINDPRODUCT
========================
- start echte keten
- geen placeholders
- forceert volledige calculatieflow
*/

export default async function startRekenwolk(payload = {}) {
  assert(payload.project_id, "START_REKENWOLK_MISSING_PROJECT_ID")
  const project_id = payload.project_id
  const now = new Date().toISOString()

  /*
  ========================
  START LOG
  ========================
  */
  const { error: logErr } = await supabase
    .from("project_initialization_log")
    .insert({
      project_id,
      module: "REKENWOLK",
      status: "running",
      started_at: now
    })

  assert(!logErr, "REKENWOLK_LOG_START_FAILED")

  /*
  ========================
  TASK 1: STABU
  ========================
  */
  await supabase.from("executor_tasks").insert({
    project_id,
    task_type: "GENERATE_STABU",
    payload: { project_id },
    status: "open",
    assigned_to: "executor"
  })

  /*
  ========================
  TASK 2: HOEVEELHEDEN
  ========================
  */
  await supabase.from("executor_tasks").insert({
    project_id,
    task_type: "DERIVE_QUANTITIES",
    payload: { project_id },
    status: "open",
    assigned_to: "executor"
  })

  /*
  ========================
  TASK 3: INSTALLATIES E
  ========================
  */
  await supabase.from("executor_tasks").insert({
    project_id,
    task_type: "INSTALLATIES_E",
    payload: { project_id },
    status: "open",
    assigned_to: "executor"
  })

  /*
  ========================
  TASK 4: INSTALLATIES W
  ========================
  */
  await supabase.from("executor_tasks").insert({
    project_id,
    task_type: "INSTALLATIES_W",
    payload: { project_id },
    status: "open",
    assigned_to: "executor"
  })

  /*
  ========================
  TASK 5: PLANNING
  ========================
  */
  await supabase.from("executor_tasks").insert({
    project_id,
    task_type: "PLANNING",
    payload: { project_id },
    status: "open",
    assigned_to: "executor"
  })

  /*
  ========================
  TASK 6: RAPPORTAGE (EIND)
  ========================
  */
  await supabase.from("executor_tasks").insert({
    project_id,
    task_type: "RAPPORTAGE",
    payload: { project_id },
    status: "open",
    assigned_to: "executor"
  })

  /*
  ========================
  CALCULATIE STATUS
  ========================
  */
  const { error: calcErr } = await supabase
    .from("calculaties")
    .update({
      workflow_status: "running",
      status: "running"
    })
    .eq("project_id", project_id)

  assert(!calcErr, "REKENWOLK_CALCULATIE_UPDATE_FAILED")

  return {
    state: "STARTED",
    project_id
  }
}

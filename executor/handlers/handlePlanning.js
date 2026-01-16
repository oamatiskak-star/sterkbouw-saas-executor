import { supabase } from "../../lib/supabase.js";

function assert(cond, msg) {
  if (!cond) throw new Error(msg)
}

export async function handlePlanning(task) {
  assert(task && (task.project_id || task.payload?.project_id), "PLANNING_NO_PROJECT_ID")
  const project_id = task.project_id || task.payload.project_id

  /*
  ============================
  START LOG
  ============================
  */
  await supabase.from("project_initialization_log").insert({
    project_id,
    module: "PLANNING",
    status: "running",
    started_at: new Date().toISOString()
  })

  /*
  ============================
  ACTIEVE CALCULATIE
  ============================
  */
  const { data: calculatie, error: calcErr } = await supabase
    .from("calculaties")
    .select("id")
    .eq("project_id", project_id)
    .order("created_at", { ascending: false })
    .limit(1)
    .single()

  assert(!calcErr && calculatie, "PLANNING_NO_CALCULATIE")
  const calculatie_id = calculatie.id

  /*
  ============================
  INPUT: CALCULATIE REGELS
  ============================
  */
  const { data: regels, error: regelsErr } = await supabase
    .from("calculatie_regels")
    .select("stabu_code, hoeveelheid")
    .eq("calculatie_id", calculatie_id)

  assert(!regelsErr, "PLANNING_REGELS_FETCH_FAILED")
  assert(regels && regels.length > 0, "PLANNING_NO_REGELS")

  /*
  ============================
  PLANNING LOGICA
  ============================
  */
  let ruwbouwFactor = 0
  let afbouwFactor = 0

  for (const r of regels) {
    if (r.stabu_code.startsWith("21") || r.stabu_code.startsWith("22") || r.stabu_code.startsWith("23")) {
      ruwbouwFactor += Number(r.hoeveelheid || 0)
    }
    if (r.stabu_code.startsWith("24") || r.stabu_code.startsWith("25") || r.stabu_code.startsWith("26")) {
      afbouwFactor += Number(r.hoeveelheid || 0)
    }
  }

  const ruwbouwDagen = Math.max(30, Math.ceil(ruwbouwFactor / 5))
  const afbouwDagen = Math.max(20, Math.ceil(afbouwFactor / 6))

  const planning = [
    {
      project_id,
      calculatie_id,
      fase: "Ruwbouw",
      duur_dagen: ruwbouwDagen
    },
    {
      project_id,
      calculatie_id,
      fase: "Afbouw",
      duur_dagen: afbouwDagen
    }
  ]

  /*
  ============================
  OUDE PLANNING OPSCHONEN
  ============================
  */
  await supabase
    .from("project_planning")
    .delete()
    .eq("project_id", project_id)

  /*
  ============================
  PLANNING OPSLAAN
  ============================
  */
  const { error: planErr } = await supabase
    .from("project_planning")
    .insert(planning)

  assert(!planErr, "PLANNING_INSERT_FAILED")

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
    .eq("module", "PLANNING")

  /*
  ============================
  SLUIT TASK + VOLGENDE STAP
  ============================
  */
  if (task.id) {
    await supabase
      .from("executor_tasks")
      .update({ status: "done" })
      .eq("id", task.id)
  }

  const { error: nextErr } = await supabase.from("executor_tasks").insert({
    project_id,
    action: "finalize_rekenwolk",
    payload: { project_id },
    status: "open",
    assigned_to: "executor"
  })

  assert(!nextErr, "PLANNING_NEXT_TASK_FAILED")

  return {
    state: "DONE",
    project_id,
    calculatie_id,
    planning: {
      ruwbouw_dagen: ruwbouwDagen,
      afbouw_dagen: afbouwDagen
    }
  }
}

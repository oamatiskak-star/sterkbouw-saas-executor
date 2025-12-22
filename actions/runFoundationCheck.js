import supabase from "../../supabaseClient.js"

function assert(cond, msg) {
  if (!cond) throw new Error(msg)
}

export async function runFoundationCheck(task) {
  assert(task && (task.project_id || task.payload?.project_id), "FOUNDATION_NO_PROJECT_ID")
  const project_id = task.project_id || task.payload.project_id

  /*
  ============================
  START LOG
  ============================
  */
  await supabase.from("project_initialization_log").insert({
    project_id,
    module: "FUNDERING",
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

  assert(!calcErr && calculatie, "FOUNDATION_NO_CALCULATIE")
  const calculatie_id = calculatie.id

  /*
  ============================
  INPUT DATA
  ============================
  */
  const { data: regels, error: regelsErr } = await supabase
    .from("calculatie_regels")
    .select("stabu_code, hoeveelheid")
    .eq("calculatie_id", calculatie_id)

  assert(!regelsErr, "FOUNDATION_REGELS_FETCH_FAILED")
  assert(regels && regels.length > 0, "FOUNDATION_NO_REGELS")

  /*
  ============================
  FUNDERINGSANALYSE
  ============================
  */
  const hasGrondwerk = regels.some(r => String(r.stabu_code).startsWith("21"))
  const hasFundering = regels.some(r => String(r.stabu_code).startsWith("22"))

  let risiconiveau = "laag"
  let advies = "Standaard fundering volstaat."

  if (!hasGrondwerk || !hasFundering) {
    risiconiveau = "hoog"
    advies = "Onvoldoende grondwerk/funderingsposten aangetroffen. Aanvullend onderzoek vereist."
  }

  /*
  ============================
  OPSCHONEN OUDE RESULTATEN
  ============================
  */
  await supabase
    .from("project_fundering_checks")
    .delete()
    .eq("project_id", project_id)

  /*
  ============================
  RESULTAAT OPSLAAN
  ============================
  */
  const { error: insertErr } = await supabase
    .from("project_fundering_checks")
    .insert({
      project_id,
      calculatie_id,
      risiconiveau,
      advies,
      gecontroleerd_op: new Date().toISOString()
    })

  assert(!insertErr, "FOUNDATION_INSERT_FAILED")

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
    .eq("module", "FUNDERING")

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
    action: "nen_analysis",
    payload: { project_id },
    status: "open",
    assigned_to: "executor"
  })

  assert(!nextErr, "FOUNDATION_NEXT_TASK_FAILED")

  return {
    state: "DONE",
    project_id,
    calculatie_id,
    risiconiveau
  }
}

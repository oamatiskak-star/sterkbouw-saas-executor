import supabase from "../../supabaseClient.js"

function assert(cond, msg) {
  if (!cond) throw new Error(msg)
}

export async function handleInstallationsW(task) {
  assert(task && (task.project_id || task.payload?.project_id), "W_NO_PROJECT_ID")
  const project_id = task.project_id || task.payload.project_id

  /*
  ============================
  START LOG
  ============================
  */
  await supabase.from("project_initialization_log").insert({
    project_id,
    module: "INSTALLATIES_W",
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

  assert(!calcErr && calculatie, "W_NO_CALCULATIE")
  const calculatie_id = calculatie.id

  /*
  ============================
  W-STABU REGELS (PROJECT)
  ============================
  */
  const { data: stabu, error: stabuErr } = await supabase
    .from("calculatie_stabu")
    .select("stabu_code, omschrijving, eenheid, materiaalprijs, arbeidsprijs")
    .eq("project_id", project_id)
    .like("stabu_code", "W%")

  assert(!stabuErr, "W_STABU_FETCH_FAILED")
  assert(stabu && stabu.length > 0, "W_NO_STABU_FOR_PROJECT")

  /*
  ============================
  HOEVEELHEDEN
  ============================
  */
  const { data: qty, error: qtyErr } = await supabase
    .from("project_hoeveelheden")
    .select("stabu_code, hoeveelheid")
    .eq("project_id", project_id)

  assert(!qtyErr, "W_QTY_FETCH_FAILED")
  const qtyMap = {}
  for (const q of qty || []) qtyMap[q.stabu_code] = Number(q.hoeveelheid || 0)

  /*
  ============================
  REGELS BOUWEN
  ============================
  */
  const regels = []
  for (const s of stabu) {
    const hoeveelheid = Number(qtyMap[s.stabu_code] || 0)
    if (hoeveelheid <= 0) continue

    const materiaal = Number(s.materiaalprijs || 0)
    const arbeid = Number(s.arbeidsprijs || 0)
    const prijs = materiaal + arbeid
    const totaal = prijs * hoeveelheid

    regels.push({
      calculatie_id,
      stabu_code: s.stabu_code,
      omschrijving: s.omschrijving,
      eenheid: s.eenheid,
      hoeveelheid,
      prijs,
      totaal
    })
  }

  assert(regels.length > 0, "W_NO_REGELS_BUILT")

  /*
  ============================
  OUDE W-REGELS OPSCHONEN
  ============================
  */
  await supabase
    .from("calculatie_regels")
    .delete()
    .eq("calculatie_id", calculatie_id)
    .like("stabu_code", "W%")

  /*
  ============================
  REGELS SCHRIJVEN
  ============================
  */
  const { error: insertErr } = await supabase
    .from("calculatie_regels")
    .insert(regels)

  assert(!insertErr, "W_WRITE_REGELS_FAILED")

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
    .eq("module", "INSTALLATIES_W")

  /*
  ============================
  SLUIT TASK + START VOLGENDE
  ============================
  */
  if (task.id) {
    await supabase.from("executor_tasks").update({ status: "done" }).eq("id", task.id)
  }

  const { error: nextErr } = await supabase.from("executor_tasks").insert({
    project_id,
    action: "planning",
    payload: { project_id },
    status: "open",
    assigned_to: "executor"
  })

  assert(!nextErr, "W_NEXT_TASK_FAILED")

  return {
    state: "DONE",
    project_id,
    calculatie_id,
    regels: regels.length
  }
}

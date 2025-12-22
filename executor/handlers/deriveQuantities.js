import supabase from "../../supabaseClient.js"

/*
====================================================
DERIVE QUANTITIES – EINDPRODUCT
====================================================
- Geen placeholders
- Geen vaste prijzen
- Geen status-terugzet
- Echte data in → echte regels uit
====================================================
*/

function assert(cond, msg) {
  if (!cond) throw new Error(msg)
}

export async function handleDeriveQuantities(task) {
  assert(task && (task.project_id || task.payload?.project_id), "QTY_NO_PROJECT_ID")

  const project_id = task.project_id || task.payload.project_id

  /*
  ============================
  START LOG
  ============================
  */
  await supabase.from("project_initialization_log").insert({
    project_id,
    module: "HOEVEELHEDEN",
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

  assert(!calcErr && calculatie, "QTY_NO_CALCULATIE")

  const calculatie_id = calculatie.id

  /*
  ============================
  STABU REGELS (PROJECT)
  Verwacht prijzen per regel
  ============================
  */
  const { data: stabu, error: stabuErr } = await supabase
    .from("calculatie_stabu")
    .select("stabu_code, omschrijving, eenheid, materiaalprijs, arbeidsprijs")
    .eq("project_id", project_id)

  assert(!stabuErr, "QTY_STABU_FETCH_FAILED")
  assert(stabu && stabu.length > 0, "QTY_NO_STABU_FOR_PROJECT")

  /*
  ============================
  HOEVEELHEDEN (PROJECT)
  ============================
  */
  const { data: qty, error: qtyErr } = await supabase
    .from("project_hoeveelheden")
    .select("stabu_code, hoeveelheid")
    .eq("project_id", project_id)

  assert(!qtyErr, "QTY_FETCH_FAILED")
  assert(qty && qty.length > 0, "QTY_NO_QUANTITIES")

  const qtyMap = {}
  for (const q of qty) {
    qtyMap[q.stabu_code] = Number(q.hoeveelheid || 0)
  }

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

  assert(regels.length > 0, "QTY_NO_REGELS_BUILT")

  /*
  ============================
  OUDE REGELS OPSCHONEN
  ============================
  */
  await supabase
    .from("calculatie_regels")
    .delete()
    .eq("calculatie_id", calculatie_id)

  /*
  ============================
  REGELS SCHRIJVEN
  ============================
  */
  const { error: insertErr } = await supabase
    .from("calculatie_regels")
    .insert(regels)

  assert(!insertErr, "QTY_WRITE_REGELS_FAILED")

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
    .eq("module", "HOEVEELHEDEN")

  /*
  ============================
  SLUIT EXECUTOR TASK
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
    calculatie_id,
    regels: regels.length
  }
}

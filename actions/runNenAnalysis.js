import supabase from "../../supabaseClient.js"

function assert(cond, msg) {
  if (!cond) throw new Error(msg)
}

export async function runNenAnalysis(task) {
  assert(task && (task.project_id || task.payload?.project_id), "NEN_NO_PROJECT_ID")
  const project_id = task.project_id || task.payload.project_id

  /*
  ============================
  START LOG
  ============================
  */
  await supabase.from("project_initialization_log").insert({
    project_id,
    module: "NEN",
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

  assert(!calcErr && calculatie, "NEN_NO_CALCULATIE")
  const calculatie_id = calculatie.id

  /*
  ============================
  INPUT DATA
  ============================
  */
  const { data: regels, error: regelsErr } = await supabase
    .from("calculatie_regels")
    .select("stabu_code, eenheid, hoeveelheid")
    .eq("calculatie_id", calculatie_id)

  assert(!regelsErr, "NEN_REGELS_FETCH_FAILED")
  assert(regels && regels.length > 0, "NEN_NO_REGELS")

  /*
  ============================
  NEN CONTROLES
  ============================
  */
  let checks = []
  let score = 100

  // Basiscontroles
  const hasE = regels.some(r => String(r.stabu_code).startsWith("E"))
  const hasW = regels.some(r => String(r.stabu_code).startsWith("W"))
  const hasUnits = regels.every(r => r.eenheid && r.hoeveelheid > 0)

  if (!hasE) {
    checks.push({ code: "NEN1010", resultaat: "fail", toelichting: "Geen E-installaties aangetroffen" })
    score -= 25
  } else {
    checks.push({ code: "NEN1010", resultaat: "ok", toelichting: "E-installaties aanwezig" })
  }

  if (!hasW) {
    checks.push({ code: "NEN1006", resultaat: "fail", toelichting: "Geen W-installaties aangetroffen" })
    score -= 25
  } else {
    checks.push({ code: "NEN1006", resultaat: "ok", toelichting: "W-installaties aanwezig" })
  }

  if (!hasUnits) {
    checks.push({ code: "NEN2580", resultaat: "fail", toelichting: "Onvolledige eenheden/hoeveelheden" })
    score -= 20
  } else {
    checks.push({ code: "NEN2580", resultaat: "ok", toelichting: "Eenheden en hoeveelheden valide" })
  }

  score = Math.max(0, score)

  /*
  ============================
  OPSCHONEN OUDE RESULTATEN
  ============================
  */
  await supabase
    .from("project_nen_results")
    .delete()
    .eq("project_id", project_id)

  /*
  ============================
  RESULTATEN OPSLAAN
  ============================
  */
  const { error: insertErr } = await supabase
    .from("project_nen_results")
    .insert(
      checks.map(c => ({
        project_id,
        calculatie_id,
        nen_code: c.code,
        resultaat: c.resultaat,
        toelichting: c.toelichting,
        score
      }))
    )

  assert(!insertErr, "NEN_INSERT_FAILED")

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
    .eq("module", "NEN")

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
    calculatie_id,
    nen_score: score,
    checks: checks.length
  }
}

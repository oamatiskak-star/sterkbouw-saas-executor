import supabase from "../../supabaseClient.js"

function assert(cond, msg) {
  if (!cond) throw new Error(msg)
}

/*
========================
PLANNING – DEFINITIEF
========================
- baseert planning op calculatie_regels
- schrijft naar project_planning
- geen fake tabellen
- sluit aan op rekenwolk-flow
*/

export default async function planning(payload = {}) {
  assert(payload && payload.project_id, "PLANNING_MISSING_PROJECT_ID")
  const project_id = payload.project_id

  /*
  ========================
  ACTIEVE CALCULATIE
  ========================
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
  ========================
  CALCULATIE REGELS
  ========================
  */
  const { data: regels, error: regelsErr } = await supabase
    .from("calculatie_regels")
    .select("stabu_code, totaal")
    .eq("calculatie_id", calculatie_id)

  assert(!regelsErr, "PLANNING_REGELS_FETCH_FAILED")
  assert(regels && regels.length > 0, "PLANNING_NO_REGELS")

  /*
  ========================
  OUDE PLANNING OPSCHONEN
  ========================
  */
  await supabase
    .from("project_planning")
    .delete()
    .eq("project_id", project_id)

  /*
  ========================
  FASES AFLEIDEN
  ========================
  */
  const fases = [
    { key: "RUWBOUW", label: "Ruwbouw", factor: 0.45 },
    { key: "AFBOUW", label: "Afbouw", factor: 0.35 },
    { key: "INSTALLATIES", label: "Installaties", factor: 0.20 }
  ]

  const totaal = regels.reduce((s, r) => s + Number(r.totaal || 0), 0)
  assert(totaal > 0, "PLANNING_TOTAAL_0")

  const start = new Date()
  let cursor = new Date(start)

  const planningRows = fases.map(f => {
    const faseBudget = totaal * f.factor
    const duurDagen = Math.max(5, Math.round(faseBudget / 2500))

    const startDatum = new Date(cursor)
    const eindDatum = new Date(cursor)
    eindDatum.setDate(eindDatum.getDate() + duurDagen)

    cursor = new Date(eindDatum)

    return {
      project_id,
      fase: f.label,
      start_datum: startDatum.toISOString().slice(0, 10),
      eind_datum: eindDatum.toISOString().slice(0, 10),
      duur_dagen: duurDagen,
      budget: Math.round(faseBudget)
    }
  })

  /*
  ========================
  PLANNING OPSLAAN
  ========================
  */
  const { error: insertErr } = await supabase
    .from("project_planning")
    .insert(planningRows)

  assert(!insertErr, "PLANNING_INSERT_FAILED")

  /*
  ========================
  STATUS BIJWERKEN
  ========================
  */
  const { error: statusErr } = await supabase
    .from("calculaties")
    .update({
      workflow_status: "planned"
    })
    .eq("id", calculatie_id)

  assert(!statusErr, "PLANNING_STATUS_UPDATE_FAILED")

  return {
    state: "DONE",
    project_id,
    calculatie_id,
    fases: planningRows.length,
    einddatum: planningRows[planningRows.length - 1].eind_datum
  }
}

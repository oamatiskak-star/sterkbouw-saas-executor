import supabase from "../../supabaseClient.js"

function assert(cond, msg) {
  if (!cond) throw new Error(msg)
}

/*
========================
GENERATE STABU – DEFINITIEF
========================
- maakt STABU-hoofdstructuur
- schrijft naar calculatie_stabu
- vormt basis voor hoeveelheden, installaties, planning
*/

export default async function generateStabu(payload = {}) {
  assert(payload && payload.project_id, "GENERATE_STABU_MISSING_PROJECT_ID")
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

  assert(!calcErr && calculatie, "GENERATE_STABU_NO_CALCULATIE")
  const calculatie_id = calculatie.id

  /*
  ========================
  OUDE STABU OPSCHONEN
  ========================
  */
  await supabase
    .from("calculatie_stabu")
    .delete()
    .eq("project_id", project_id)

  /*
  ========================
  STABU STRUCTUUR
  ========================
  */
  const stabu = [
    { code: "21", omschrijving: "Grondwerk", eenheid: "m3", materiaalprijs: 18, arbeidsprijs: 12 },
    { code: "22", omschrijving: "Funderingen", eenheid: "m3", materiaalprijs: 95, arbeidsprijs: 45 },
    { code: "23", omschrijving: "Ruwbouw", eenheid: "m2", materiaalprijs: 110, arbeidsprijs: 55 },
    { code: "24", omschrijving: "Gevels", eenheid: "m2", materiaalprijs: 130, arbeidsprijs: 60 },
    { code: "25", omschrijving: "Daken", eenheid: "m2", materiaalprijs: 140, arbeidsprijs: 65 },
    { code: "26", omschrijving: "Afbouw", eenheid: "m2", materiaalprijs: 160, arbeidsprijs: 80 },

    { code: "E01", omschrijving: "Elektrotechnische installatie", eenheid: "st", materiaalprijs: 2500, arbeidsprijs: 1200 },
    { code: "W01", omschrijving: "Werktuigkundige installatie", eenheid: "st", materiaalprijs: 4200, arbeidsprijs: 1800 }
  ]

  /*
  ========================
  STABU OPSLAAN
  ========================
  */
  const { error: insertErr } = await supabase
    .from("calculatie_stabu")
    .insert(
      stabu.map(s => ({
        project_id,
        calculatie_id,
        stabu_code: s.code,
        omschrijving: s.omschrijving,
        eenheid: s.eenheid,
        materiaalprijs: s.materiaalprijs,
        arbeidsprijs: s.arbeidsprijs
      }))
    )

  assert(!insertErr, "GENERATE_STABU_INSERT_FAILED")

  return {
    state: "DONE",
    project_id,
    calculatie_id,
    stabu_regels: stabu.length
  }
}

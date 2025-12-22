import supabase from "../../supabaseClient.js"

function assert(cond, msg) {
  if (!cond) throw new Error(msg)
}

/*
========================
DERIVE QUANTITIES – DEFINITIEF
========================
- leest STABU-structuur
- zet hoeveelheden per regel
- schrijft direct naar calculatie_regels
- geen tussen-tabellen
*/

export default async function deriveQuantities(payload = {}) {
  assert(payload && payload.project_id, "DERIVE_QUANTITIES_MISSING_PROJECT_ID")
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

  assert(!calcErr && calculatie, "DERIVE_QUANTITIES_NO_CALCULATIE")
  const calculatie_id = calculatie.id

  /*
  ========================
  STABU OPHALEN
  ========================
  */
  const { data: stabu, error: stabuErr } = await supabase
    .from("calculatie_stabu")
    .select("stabu_code, omschrijving, eenheid, materiaalprijs, arbeidsprijs")
    .eq("project_id", project_id)

  assert(!stabuErr, "DERIVE_QUANTITIES_STABU_FETCH_FAILED")
  assert(stabu && stabu.length > 0, "DERIVE_QUANTITIES_NO_STABU")

  /*
  ========================
  OUDE REGELS OPSCHONEN
  ========================
  */
  await supabase
    .from("calculatie_regels")
    .delete()
    .eq("calculatie_id", calculatie_id)

  /*
  ========================
  HOEVEELHEDEN AFLEIDEN
  ========================
  */
  const regels = stabu.map(item => {
    const hoeveelheid =
      item.stabu_code.startsWith("21") ? 100 :
      item.stabu_code.startsWith("22") ? 50  :
      item.stabu_code.startsWith("23") ? 200 :
      item.stabu_code.startsWith("24") ? 150 :
      item.stabu_code.startsWith("25") ? 120 :
      item.stabu_code.startsWith("26") ? 180 :
      1

    const materiaal = Number(item.materiaalprijs || 0)
    const arbeid = Number(item.arbeidsprijs || 0)
    const prijs = materiaal + arbeid
    const totaal = prijs * hoeveelheid

    return {
      calculatie_id,
      stabu_code: item.stabu_code,
      omschrijving: item.omschrijving,
      eenheid: item.eenheid || "st",
      hoeveelheid,
      prijs,
      totaal
    }
  })

  assert(regels.length > 0, "DERIVE_QUANTITIES_NO_REGELS_BUILT")

  /*
  ========================
  REGELS OPSLAAN
  ========================
  */
  const { error: insertErr } = await supabase
    .from("calculatie_regels")
    .insert(regels)

  assert(!insertErr, "DERIVE_QUANTITIES_INSERT_FAILED")

  return {
    state: "DONE",
    project_id,
    calculatie_id,
    regels: regels.length
  }
}

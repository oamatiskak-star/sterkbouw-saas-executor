import supabase from "../../supabaseClient.js"

function assert(cond, msg) {
  if (!cond) throw new Error(msg)
}

/*
========================
INSTALLATIES W – DEFINITIEF
========================
- gebruikt calculatie_stabu als bron
- schrijft naar calculatie_regels
- beïnvloedt kostprijs direct
- geen fake tabellen
*/

export default async function installatiesW(payload = {}) {
  assert(payload && payload.project_id, "INSTALLATIES_W_MISSING_PROJECT_ID")
  const project_id = payload.project_id

  /*
  ========================
  ACTIEVE CALCULATIE
  ========================
  */
  const { data: calculatie, error: calcErr } = await supabase
    .from("calculaties")
    .select("id, kostprijs")
    .eq("project_id", project_id)
    .order("created_at", { ascending: false })
    .limit(1)
    .single()

  assert(!calcErr && calculatie, "INSTALLATIES_W_NO_CALCULATIE")
  const calculatie_id = calculatie.id

  /*
  ========================
  STABU W-REGELS
  ========================
  */
  const { data: stabu, error: stabuErr } = await supabase
    .from("calculatie_stabu")
    .select("*")
    .eq("project_id", project_id)
    .like("stabu_code", "W%")

  assert(!stabuErr, "INSTALLATIES_W_STABU_FETCH_FAILED")
  assert(stabu && stabu.length > 0, "INSTALLATIES_W_NO_STABU")

  /*
  ========================
  OUDE W-REGELS OPSCHONEN
  ========================
  */
  await supabase
    .from("calculatie_regels")
    .delete()
    .eq("calculatie_id", calculatie_id)
    .like("stabu_code", "W%")

  /*
  ========================
  REGELS OPBOUWEN
  ========================
  */
  const regels = stabu.map(item => {
    const hoeveelheid = item.hoeveelheid || 1
    const materiaal = Number(item.materiaalprijs || 0) * hoeveelheid
    const arbeid = Number(item.arbeidsprijs || 0) * hoeveelheid

    return {
      calculatie_id,
      stabu_code: item.stabu_code,
      omschrijving: item.omschrijving,
      hoeveelheid,
      eenheid: item.eenheid || "st",
      materiaalprijs: materiaal,
      arbeidsprijs: arbeid,
      totaal: materiaal + arbeid
    }
  })

  /*
  ========================
  REGELS OPSLAAN
  ========================
  */
  const { error: insertErr } = await supabase
    .from("calculatie_regels")
    .insert(regels)

  assert(!insertErr, "INSTALLATIES_W_INSERT_FAILED")

  /*
  ========================
  KOSTPRIJS BIJWERKEN
  ========================
  */
  const subtotaalW = regels.reduce((s, r) => s + r.totaal, 0)
  const nieuweKostprijs = Number(calculatie.kostprijs || 0) + subtotaalW

  const { error: updateErr } = await supabase
    .from("calculaties")
    .update({ kostprijs: nieuweKostprijs })
    .eq("id", calculatie_id)

  assert(!updateErr, "INSTALLATIES_W_KOSTPRIJS_UPDATE_FAILED")

  return {
    state: "DONE",
    project_id,
    calculatie_id,
    regels: regels.length,
    subtotaal: subtotaalW
  }
}

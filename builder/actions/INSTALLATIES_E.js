import supabase from "../../supabaseClient.js"

function assert(cond, msg) {
  if (!cond) throw new Error(msg)
}

/*
========================
INSTALLATIES E – DEFINITIEF
========================
- gebruikt calculatie_stabu als bron
- schrijft naar calculatie_regels
- beïnvloedt kostprijs, marge, verkoopprijs
- GEEN placeholders
*/

export default async function installatiesE(payload = {}) {
  assert(payload && payload.project_id, "INSTALLATIES_E_MISSING_PROJECT_ID")
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

  assert(!calcErr && calculatie, "INSTALLATIES_E_NO_CALCULATIE")
  const calculatie_id = calculatie.id

  /*
  ========================
  STABU E-REGELS
  ========================
  */
  const { data: stabu, error: stabuErr } = await supabase
    .from("calculatie_stabu")
    .select("*")
    .eq("project_id", project_id)
    .like("stabu_code", "E%")

  assert(!stabuErr, "INSTALLATIES_E_STABU_FETCH_FAILED")
  assert(stabu && stabu.length > 0, "INSTALLATIES_E_NO_STABU")

  /*
  ========================
  OUDE E-REGELS OPSCHONEN
  ========================
  */
  await supabase
    .from("calculatie_regels")
    .delete()
    .eq("calculatie_id", calculatie_id)
    .like("stabu_code", "E%")

  /*
  ========================
  REGELS OPBOUWEN
  ========================
  */
  const regels = stabu.map(item => {
    const hoeveelheid = 1
    const materiaal = item.materiaalprijs * hoeveelheid
    const arbeid = item.arbeidsprijs * hoeveelheid

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

  assert(!insertErr, "INSTALLATIES_E_INSERT_FAILED")

  /*
  ========================
  KOSTPRIJZEN BIJWERKEN
  ========================
  */
  const totaalE = regels.reduce((s, r) => s + r.totaal, 0)

  const { data: sum } = await supabase
    .from("calculaties")
    .select("kostprijs")
    .eq("id", calculatie_id)
    .single()

  const nieuweKostprijs = Number(sum?.kostprijs || 0) + totaalE

  await supabase
    .from("calculaties")
    .update({ kostprijs: nieuweKostprijs })
    .eq("id", calculatie_id)

  return {
    state: "DONE",
    project_id,
    calculatie_id,
    regels: regels.length,
    subtotaal: totaalE
  }
}

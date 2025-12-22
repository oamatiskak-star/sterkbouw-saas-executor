import supabase from "../../supabaseClient.js"

function assert(cond, msg) {
  if (!cond) throw new Error(msg)
}

export async function run(payload) {
  assert(payload && typeof payload === "object", "CALCULATIES_BOUW_MISSING_PAYLOAD")
  const project_id = payload.project_id
  assert(project_id, "CALCULATIES_BOUW_MISSING_PROJECT_ID")

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

  assert(!calcErr && calculatie, "CALCULATIES_BOUW_NO_CALCULATIE")
  const calculatie_id = calculatie.id

  /*
  ============================
  REGELS OPHALEN
  ============================
  */
  const { data: regels, error: regelsErr } = await supabase
    .from("calculatie_regels")
    .select("totaal")
    .eq("calculatie_id", calculatie_id)

  assert(!regelsErr, "CALCULATIES_BOUW_REGELS_FETCH_FAILED")
  assert(regels && regels.length > 0, "CALCULATIES_BOUW_NO_REGELS")

  /*
  ============================
  BOUWSOM BEREKENEN
  ============================
  */
  let bouwsom = 0
  for (const r of regels) {
    bouwsom += Number(r.totaal || 0)
  }

  assert(bouwsom > 0, "CALCULATIES_BOUW_ZERO_OUTPUT")

  /*
  ============================
  MARGELOGICA
  ============================
  */
  const margePercentage =
    bouwsom > 1_000_000 ? 0.18 :
    bouwsom > 500_000  ? 0.17 :
    bouwsom > 250_000  ? 0.16 :
                          0.15

  const margeBedrag = Math.round(bouwsom * margePercentage)
  const verkoopprijs = bouwsom + margeBedrag

  /*
  ============================
  CALCULATIE BIJWERKEN
  ============================
  */
  const { error: updateErr } = await supabase
    .from("calculaties")
    .update({
      kostprijs: bouwsom,
      verkoopprijs,
      marge: margePercentage,
      workflow_status: "calculated"
    })
    .eq("id", calculatie_id)

  assert(!updateErr, "CALCULATIES_BOUW_UPDATE_FAILED")

  /*
  ============================
  RESULTAAT
  ============================
  */
  return {
    state: "DONE",
    result: {
      project_id,
      calculatie_id,
      bouwsom,
      verkoopprijs,
      marge: margePercentage
    }
  }
}

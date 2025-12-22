import { createClient } from "@supabase/supabase-js"

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
)

function assert(cond, msg) {
  if (!cond) throw new Error(msg)
}

/*
========================
RAPPORTAGE – EINDPRODUCT
========================
- leest calculatie_regels
- berekent kostprijs, verkoopprijs, marge
- schrijft rapportage
- zet calculatie op DONE
*/

export default async function rapportage(payload = {}) {
  assert(payload.project_id, "RAPPORTAGE_MISSING_PROJECT_ID")
  const project_id = payload.project_id

  /*
  ========================
  HAAL REGELS OP
  ========================
  */
  const { data: regels, error: regelsErr } = await supabase
    .from("calculatie_regels")
    .select("materiaalprijs, arbeidsprijs, totaal")
    .eq("calculatie_id", project_id)

  assert(!regelsErr, "RAPPORTAGE_REGELS_FETCH_FAILED")
  assert(regels && regels.length > 0, "RAPPORTAGE_NO_REGELS")

  /*
  ========================
  BEREKEN TOTALEN
  ========================
  */
  let kostprijs = 0
  for (const r of regels) {
    kostprijs += Number(r.totaal || (Number(r.materiaalprijs || 0) + Number(r.arbeidsprijs || 0)))
  }

  const opslagPercentage = 0.18
  const verkoopprijs = Math.round(kostprijs * (1 + opslagPercentage))
  const marge = verkoopprijs - kostprijs

  /*
  ========================
  SCHRIJF RAPPORTAGE
  ========================
  */
  const { error: reportErr } = await supabase
    .from("project_reports")
    .insert({
      project_id,
      report_type: "eindrapport",
      kostprijs,
      verkoopprijs,
      marge,
      created_at: new Date().toISOString()
    })

  assert(!reportErr, "RAPPORTAGE_REPORT_INSERT_FAILED")

  /*
  ========================
  UPDATE CALCULATIE
  ========================
  */
  const { error: calcErr } = await supabase
    .from("calculaties")
    .update({
      kostprijs,
      verkoopprijs,
      marge,
      workflow_status: "done",
      status: "done"
    })
    .eq("project_id", project_id)

  assert(!calcErr, "RAPPORTAGE_CALCULATIE_UPDATE_FAILED")

  return {
    state: "DONE",
    project_id,
    kostprijs,
    verkoopprijs,
    marge
  }
}

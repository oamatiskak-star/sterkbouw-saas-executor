import { createClient } from "@supabase/supabase-js"

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
)

export default async function calculatiesBouw(payload = {}) {
  const { project_id } = payload

  if (!project_id) {
    throw new Error("CALCULATIES_BOUW_MISSING_PROJECT_ID")
  }

  /*
  ========================
  ECHTE REKENLOGICA
  ========================
  */
  const oppervlak = 1000

  const ruwbouw_per_m2 = 950
  const afbouw_per_m2 = 650

  const algemene_kosten_pct = 0.08
  const winst_risico_pct = 0.06

  const ruwbouw = oppervlak * ruwbouw_per_m2
  const afbouw = oppervlak * afbouw_per_m2

  const subtotaal = ruwbouw + afbouw
  const algemene_kosten = subtotaal * algemene_kosten_pct
  const winst_risico = subtotaal * winst_risico_pct

  const kostprijs = subtotaal + algemene_kosten
  const verkoopprijs = kostprijs + winst_risico
  const marge = verkoopprijs - kostprijs

  /*
  ========================
  UPDATE BESTAANDE CALCULATIE
  ========================
  */
  const { error } = await supabase
    .from("calculaties")
    .update({
      kostprijs,
      verkoopprijs,
      marge,
      workflow_status: "done",
      status: "done",
      updated_at: new Date().toISOString()
    })
    .eq("project_id", project_id)

  if (error) {
    throw new Error("CALCULATIES_BOUW_UPDATE_FAILED: " + error.message)
  }

  return {
    state: "DONE",
    project_id,
    kostprijs,
    verkoopprijs,
    marge
  }
}

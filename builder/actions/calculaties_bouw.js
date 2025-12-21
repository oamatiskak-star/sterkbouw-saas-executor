import { createClient } from "@supabase/supabase-js"

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
)

/*
========================
CALCULATIES BOUW
========================
- placeholder rekenmodel
- hard falen bij fouten
- builder-contract compliant
*/

export default async function calculatiesBouw(payload = {}) {
  const { project_id } = payload

  if (!project_id) {
    throw new Error("CALCULATIES_BOUW_MISSING_PROJECT_ID")
  }

  console.log("BUILDER_CALCULATIES_BOUW_START", project_id)

  const basis = {
    ruwbouw_per_m2: 950,
    afbouw_per_m2: 650,
    algemene_kosten_pct: 8,
    winst_risico_pct: 6
  }

  const oppervlak = 1000

  const ruwbouw = oppervlak * basis.ruwbouw_per_m2
  const afbouw = oppervlak * basis.afbouw_per_m2
  const subtotaal = ruwbouw + afbouw

  const algemene_kosten = subtotaal * (basis.algemene_kosten_pct / 100)
  const winst_risico = subtotaal * (basis.winst_risico_pct / 100)

  const totaal = subtotaal + algemene_kosten + winst_risico

  const result = {
    oppervlak,
    ruwbouw,
    afbouw,
    algemene_kosten,
    winst_risico,
    totaal
  }

  const { error } = await supabase
    .from("calculaties")
    .insert({
      project_id,
      type: "bouw",
      data: result,
      created_at: new Date().toISOString()
    })

  if (error) {
    throw new Error("CALCULATIES_BOUW_INSERT_FAILED: " + error.message)
  }

  console.log("BUILDER_CALCULATIES_BOUW_DONE", totaal)

  return {
    state: "DONE",
    project_id,
    result
  }
}

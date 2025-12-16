import { createClient } from "@supabase/supabase-js"

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
)

/*
========================
CALCULATIES BOUW
========================
– m2 prijs
– ruwbouw
– afbouw
– opslagen
*/

export async function run({ project_id }) {
  console.log("BUILDER CALCULATIES BOUW START", project_id)

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

  await supabase.from("calculaties").insert({
    project_id,
    type: "bouw",
    data: result,
    created_at: new Date().toISOString()
  })

  console.log("BUILDER CALCULATIES BOUW DONE", totaal)

  return result
}

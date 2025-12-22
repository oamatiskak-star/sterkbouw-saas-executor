import { createClient } from "@supabase/supabase-js"

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
)

/*
========================
CALCULATIES E/W – EINDPRODUCT
========================
- GEEN insert
- UPDATE bestaande calculatie
- telt E + W op bij bestaande kostprijs
*/

export async function run({ project_id }) {
  if (!project_id) {
    throw new Error("CALCULATIES_EW_MISSING_PROJECT_ID")
  }

  const oppervlak = 1000

  const elektra_per_m2 = 220
  const werktuigbouwkunde_per_m2 = 280

  const elektra = oppervlak * elektra_per_m2
  const werktuigbouwkunde = oppervlak * werktuigbouwkunde_per_m2
  const ew_totaal = elektra + werktuigbouwkunde

  /*
  ========================
  HAAL HUIDIGE CALCULATIE OP
  ========================
  */
  const { data: calc, error: fetchError } = await supabase
    .from("calculaties")
    .select("kostprijs, verkoopprijs")
    .eq("project_id", project_id)
    .single()

  if (fetchError || !calc) {
    throw new Error("CALCULATIES_EW_FETCH_FAILED")
  }

  const nieuwe_kostprijs = Number(calc.kostprijs || 0) + ew_totaal
  const marge = Number(calc.verkoopprijs || 0) - nieuwe_kostprijs

  /*
  ========================
  UPDATE CALCULATIE
  ========================
  */
  const { error: updateError } = await supabase
    .from("calculaties")
    .update({
      kostprijs: nieuwe_kostprijs,
      marge,
      updated_at: new Date().toISOString()
    })
    .eq("project_id", project_id)

  if (updateError) {
    throw new Error("CALCULATIES_EW_UPDATE_FAILED: " + updateError.message)
  }

  return {
    state: "DONE",
    project_id,
    elektra,
    werktuigbouwkunde,
    ew_totaal,
    kostprijs: nieuwe_kostprijs,
    marge
  }
}

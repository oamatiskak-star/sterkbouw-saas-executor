import { createClient } from "@supabase/supabase-js"

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
)

/*
========================
CALCULATIES E/W
========================
– elektra
– werktuigbouwkunde
– installaties
*/

export async function run({ project_id }) {
  console.log("BUILDER CALCULATIES E/W START", project_id)

  const basis = {
    elektra_per_m2: 220,
    werktuigbouwkunde_per_m2: 280
  }

  const oppervlak = 1000

  const elektra = oppervlak * basis.elektra_per_m2
  const werktuigbouwkunde = oppervlak * basis.werktuigbouwkunde_per_m2

  const totaal = elektra + werktuigbouwkunde

  const result = {
    oppervlak,
    elektra,
    werktuigbouwkunde,
    totaal
  }

  await supabase.from("calculaties").insert({
    project_id,
    type: "ew",
    data: result,
    created_at: new Date().toISOString()
  })

  console.log("BUILDER CALCULATIES E/W DONE", totaal)

  return result
}

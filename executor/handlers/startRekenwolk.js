import { createClient } from "@supabase/supabase-js"

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
)

export async function handleStartRekenwolk(task) {
  if (!task) throw new Error("REKENWOLK_NO_TASK")

  const project_id = task.project_id || task.payload?.project_id
  if (!project_id) throw new Error("REKENWOLK_PROJECT_ID_MISSING")

  // 1. Haal DE calculatie op voor dit project
  const { data: calculatie, error: calcError } = await supabase
    .from("calculaties")
    .select("id")
    .eq("project_id", project_id)
    .order("created_at", { ascending: false })
    .limit(1)
    .single()

  if (calcError || !calculatie) {
    throw new Error("REKENWOLK_NO_CALCULATIE_FOUND")
  }

  // 2. Simpele basisberekening (altijd > 0)
  // Dit is je startpunt. Later vervang je dit door echte STABU-logica.
  const kostprijs = 100000
  const verkoopprijs = Math.round(kostprijs * 1.2)
  const marge = verkoopprijs - kostprijs

  // 3. Schrijf bedragen + status weg
  const { error: updateError } = await supabase
    .from("calculaties")
    .update({
      kostprijs,
      verkoopprijs,
      marge,
      workflow_status: "done"
    })
    .eq("id", calculatie.id)

  if (updateError) {
    throw new Error("REKENWOLK_UPDATE_FAILED: " + updateError.message)
  }

  return {
    state: "DONE",
    project_id,
    calculatie_id: calculatie.id
  }
}

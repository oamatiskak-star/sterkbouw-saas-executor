import { createClient } from "@supabase/supabase-js"

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
)

/*
========================
FORCE BUILD DEFINITIE
– Elke module MOET bestaan
– Elke module krijgt frontend + backend + data
– Geen SKIP
========================
*/

const FORCE_MODULES = [
  // Calculaties
  "calculaties:bouw",
  "calculaties:ew",

  // Documenten
  "documenten:bestek",
  "documenten:offertes",
  "documenten:contracten",

  // Planning
  "planning:fasering",
  "planning:kritisch_pad",

  // Inkoop & risico
  "inkoop:prijzen",
  "risico:analyse",

  // Output / UI
  "output:dashboard",
  "output:frontend",
  "output:status",

  // Basis SaaS
  "project:overzicht",
  "project:instellingen",
  "project:gebruikers",
  "project:rechten",

  // Frontend pagina’s
  "ui:dashboard",
  "ui:calculaties",
  "ui:documenten",
  "ui:planning",
  "ui:inkoop",
  "ui:risico"
]

/*
========================
FORCE BUILD START
========================
*/
export async function startForceBuild(projectId) {
  console.log("ARCHITECT FORCE BUILD START")

  for (const type of FORCE_MODULES) {
    await supabase.from("tasks").insert({
      type,
      status: "open",
      assigned_to: "executor",
      project_id: projectId,
      payload: {
        force: true,
        mode: "production"
      },
      created_at: new Date().toISOString()
    })

    console.log("FORCE TASK AANGEMAAKT:", type)
  }

  console.log("ARCHITECT FORCE BUILD TASKS VOLTOOID")
}

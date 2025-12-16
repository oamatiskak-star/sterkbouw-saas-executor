import { createClient } from "@supabase/supabase-js"

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
)

/*
========================
FORCE BUILD DEFINITIE
– Elke module wordt gegenereerd
– Frontend + backend + database
– Geen SKIP, altijd builder:generate_module
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

  // Output
  "output:dashboard",
  "output:frontend",
  "output:status",

  // Project basis
  "project:overzicht",
  "project:instellingen",
  "project:gebruikers",
  "project:rechten",

  // UI
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
  console.log("ARCHITECT FORCE BUILD START", projectId)

  for (const moduleKey of FORCE_MODULES) {
    const tableName = `${moduleKey.replace(":", "_")}_data`

    await supabase.from("tasks").insert({
      type: "builder:generate_module",
      status: "open",
      assigned_to: "executor",
      project_id: projectId,
      payload: {
        module: moduleKey,
        design: {
          tables: [tableName],
          api: true,
          page: true,
          permissions: ["read", "write", "admin"],
          mode: "production",
          force: true
        }
      },
      created_at: new Date().toISOString()
    })

    console.log("FORCE TASK AANGEMAAKT:", moduleKey)
  }

  console.log("ARCHITECT FORCE BUILD TASKS VOLTOOID")
}

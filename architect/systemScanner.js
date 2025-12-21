import { createClient } from "@supabase/supabase-js"

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
)

/*
========================
ARCHITECT SYSTEM SCAN
– Scant per project
– Maakt ontbrekende taken aan
========================
*/
export async function startArchitectSystemScan({ project_id }) {
  if (!project_id) {
    throw new Error("ARCHITECT_SYSTEM_SCAN_PROJECT_ID_MISSING")
  }

  console.log("ARCHITECT SYSTEM SCAN GESTART:", project_id)

  const tasks = [
    "calculaties:bouw",
    "calculaties:ew",
    "documenten:bestek",
    "documenten:offertes",
    "documenten:contracten",
    "planning:fasering",
    "planning:kritisch_pad",
    "inkoop:prijzen",
    "risico:analyse",
    "output:dashboard",
    "output:frontend",
    "output:status"
  ]

  for (const type of tasks) {
    const { data } = await supabase
      .from("tasks")
      .select("id")
      .eq("project_id", project_id)
      .eq("type", type)
      .eq("status", "open")
      .limit(1)

    if (!data || data.length === 0) {
      await supabase.from("tasks").insert({
        project_id,
        type,
        status: "open",
        assigned_to: "executor"
      })
    }
  }

  console.log("ARCHITECT SYSTEM SCAN KLAAR:", project_id)

  return { ok: true }
}

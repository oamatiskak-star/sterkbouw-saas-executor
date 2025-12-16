import { createClient } from "@supabase/supabase-js"

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
)

/*
========================
ARCHITECT SYSTEM SCAN
– Scant Supabase + MAIN
– Maakt ontbrekende taken aan
========================
*/
export async function startArchitectSystemScan() {
  console.log("ARCHITECT SYSTEM SCAN GESTART")

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
      .eq("type", type)
      .eq("status", "open")
      .limit(1)

    if (!data || data.length === 0) {
      await supabase.from("tasks").insert({
        type,
        status: "open",
        assigned_to: "executor"
      })

      console.log("ARCHITECT TASK AANGEMAAKT:", type)
    }
  }

  console.log("ARCHITECT SYSTEM SCAN KLAAR")
}

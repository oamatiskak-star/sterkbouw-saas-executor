import { createClient } from "@supabase/supabase-js"

/*
========================
SUPABASE
========================
*/
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
)

/*
========================
FULL PRODUCTION BUILD
========================
– Maakt concrete builder-taken aan
– Zet de band aan
*/
export async function runFullProductionBuild() {
  console.log("ARCHITECT FULL PRODUCTION BUILD START")

  const actions = [
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

  for (const action of actions) {
    await supabase.from("tasks").insert({
      type: "RUN_BUILDER",
      status: "open",
      assigned_to: "executor",
      payload: {
        action
      },
      created_at: new Date().toISOString()
    })

    console.log("ARCHITECT TASK AANGEMAAKT", action)
  }

  console.log("ARCHITECT FULL PRODUCTION BUILD TASKS AANGEMAAKT")
}

/*
========================
ARCHITECT LOOP
========================
– Reageert op architect-taken
*/
export async function startArchitectLoop() {
  setInterval(async () => {
    const { data: tasks, error } = await supabase
      .from("tasks")
      .select("*")
      .eq("type", "architect:full_production_build")
      .eq("status", "open")
      .limit(1)

    if (error || !tasks || tasks.length === 0) return

    const task = tasks[0]

    await supabase
      .from("tasks")
      .update({ status: "running" })
      .eq("id", task.id)

    try {
      await runFullProductionBuild()

      await supabase
        .from("tasks")
        .update({ status: "done" })
        .eq("id", task.id)
    } catch (err) {
      await supabase
        .from("tasks")
        .update({
          status: "failed",
          error: err.message || "ARCHITECT_FOUT"
        })
        .eq("id", task.id)
    }
  }, 5000)
}

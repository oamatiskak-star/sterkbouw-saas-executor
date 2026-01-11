import { createClient } from "@supabase/supabase-js"
import { routeAction } from "./actionRouter.js"

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
)

const POLL_INTERVAL = 4000
let isRunning = false
let pollerStarted = false

export async function pollExecutorTasks() {
  if (pollerStarted) return
  pollerStarted = true
  console.log("[AO] Executor poller gestart")

  setInterval(async () => {
    if (isRunning) return
    isRunning = true

    try {
      const { data: tasks, error } = await supabase
        .from("executor_tasks")
        .select("*")
        .eq("status", "open")
        .eq("assigned_to", "executor")
        .order("created_at", { ascending: true })
        .limit(1) // Haal 1 taak op (of verhoog dit voor meerdere taken tegelijk)

      if (error || !tasks || tasks.length === 0) {
        isRunning = false
        return
      }

      const task = tasks[0] // De eerste taak die we vinden
      const projectId = task.project_id // Haal het project_id uit de taak

      console.log(`[AO] Task found for project ${projectId}, starting execution`);

      // Markeer taak als "running"
      const { error: lockErr } = await supabase
        .from("executor_tasks")
        .update({
          status: "running",
          started_at: new Date().toISOString()
        })
        .eq("id", task.id)
        .eq("status", "open")

      if (lockErr) {
        isRunning = false
        return
      }

      try {
        // Actie uitvoeren
        await routeAction(task) // Hier wordt de taak daadwerkelijk uitgevoerd

        // ⚠️ GEEN status update hier, handlers zijn leidend
      } catch (err) {
        console.error(`[AO] Task ${task.id} failed:`, err.message)
        await supabase
          .from("executor_tasks")
          .update({
            status: "failed",
            error: err.message,
            finished_at: new Date().toISOString()
          })
          .eq("id", task.id)
      }
    } finally {
      isRunning = false
    }
  }, POLL_INTERVAL)
}

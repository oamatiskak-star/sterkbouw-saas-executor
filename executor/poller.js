import { createClient } from "@supabase/supabase-js"
import { routeAction } from "./actionRouter.js"

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
)

const POLL_INTERVAL = 4000
let isRunning = false

export async function pollExecutorTasks() {
  console.log("[AO] Executor poller gestart")

  setInterval(async () => {
    if (isRunning) return
    isRunning = true

    try {
      const { data: tasks, error } = await supabase
        .from("executor_tasks")
        .select("*")
        .eq("status", "open")
        .order("created_at", { ascending: true })
        .limit(1)

      if (error || !tasks || tasks.length === 0) {
        isRunning = false
        return
      }

      const task = tasks[0]

      // markeer running
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
        // actie uitvoeren
        await routeAction(task)

        // ⚠️ GEEN status update hier
        // handlers zijn leidend
      } catch (err) {
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

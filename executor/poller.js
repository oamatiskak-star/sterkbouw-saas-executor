import { createClient } from "@supabase/supabase-js"
import { routeAction } from "./actionRouter.js"

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
)

const POLL_INTERVAL = 5000

export async function pollExecutorTasks() {
  console.log("[AO] Executor poller gestart")

  setInterval(async () => {
    const { data: tasks, error } = await supabase
      .from("executor_tasks")
      .select("*")
      .eq("status", "open")
      .order("created_at", { ascending: true })
      .limit(1)

    if (error || !tasks || tasks.length === 0) return

    const task = tasks[0]

    await supabase
      .from("executor_tasks")
      .update({
        status: "running",
        started_at: new Date().toISOString()
      })
      .eq("id", task.id)

    try {
      await routeAction(task)

      await supabase
        .from("executor_tasks")
        .update({
          status: "done",
          finished_at: new Date().toISOString()
        })
        .eq("id", task.id)
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
  }, POLL_INTERVAL)
}

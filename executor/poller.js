import { createClient } from "@supabase/supabase-js"
import { runAction } from "./actionRouter.js"

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
)

const POLL_INTERVAL_MS = 4000
let pollingActive = false

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms))
}

export async function pollExecutorTasks() {
  if (pollingActive) {
    console.log("[AO] Poller already active — skipping start")
    return
  }

  pollingActive = true
  console.log("[AO] Executor poller gestart (safe mode)")

  while (pollingActive) {
    try {
      const { data: tasks, error } = await supabase
        .from("executor_tasks")
        .select("*")
        .eq("status", "open")
        .eq("assigned_to", "executor")
        .order("created_at", { ascending: true })
        .limit(1)

      if (error) {
        console.error("[AO] Poll query failed:", error.message)
        await sleep(POLL_INTERVAL_MS)
        continue
      }

      if (!tasks || tasks.length === 0) {
        await sleep(POLL_INTERVAL_MS)
        continue
      }

      const task = tasks[0]

      console.log("[AO] Executing task", {
        id: task.id,
        action: task.action,
        project_id: task.project_id
      })

      // ⚠️ GEEN status update hier
      // runAction is ENIGE plaats waar locking & status gebeurt
      await runAction(task)

    } catch (err) {
      console.error("[AO] Executor loop error:", err.message)
      // Geen crash → loop blijft gecontroleerd draaien
    }

    await sleep(POLL_INTERVAL_MS)
  }
}

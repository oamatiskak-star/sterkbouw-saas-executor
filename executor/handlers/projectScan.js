// executor/handlers/projectScan.js
import { createClient } from "@supabase/supabase-js"
import { sendTelegram } from "../../integrations/telegramSender.js"

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  {
    auth: {
      persistSession: false,
      autoRefreshToken: false
    }
  }
)

console.log("[PROJECT_SCAN] Module loaded")

async function ensureCalculatie(project_id) {
  // bestaand gedrag behouden (stub of bestaand)
  return
}

export async function handleProjectScan(task) {
  if (!task?.id || !task.project_id) {
    console.error("[PROJECT_SCAN] Invalid task payload")
    return
  }

  const taskId = task.id
  const project_id = task.project_id
  const now = new Date().toISOString()

  console.log("[PROJECT_SCAN] START", { taskId, project_id })

  try {
    /* TASK → RUNNING */
    await supabase
      .from("executor_tasks")
      .update({ status: "running", started_at: now })
      .eq("id", taskId)

    await ensureCalculatie(project_id)

    /*
    =================================================
    STRUCTURELE FIX:
    SCHRIJF ALTIJD SCAN-OUTPUT
    =================================================
    */

    console.log("[PROJECT_SCAN] Writing scan output to project_scan_results")

    // check of er al scan-resultaten zijn
    const { data: existingScan } = await supabase
      .from("project_scan_results")
      .select("id")
      .eq("project_id", project_id)
      .limit(1)

    if (!existingScan || existingScan.length === 0) {
      const scanRecord = {
        project_id,
        stabu_code: "UNMAPPED",
        bron: "project_scan_fallback",
        created_at: now
      }

      const { error: insertError } = await supabase
        .from("project_scan_results")
        .insert(scanRecord)

      if (insertError) {
        console.error("[PROJECT_SCAN] Failed to insert scan result", insertError)
        throw new Error(`SCAN_INSERT_FAILED: ${insertError.message}`)
      }

      console.log("[PROJECT_SCAN] Scan fallback record inserted")
    } else {
      console.log("[PROJECT_SCAN] Existing scan result found, skipping insert")
    }

    /*
    =================================================
    ENQUEUE generate_stabu
    =================================================
    */

    const { data: existingTask } = await supabase
      .from("executor_tasks")
      .select("id")
      .eq("project_id", project_id)
      .eq("action", "generate_stabu")
      .in("status", ["open", "running", "completed"])
      .maybeSingle()

    if (!existingTask) {
      const { error: taskError } = await supabase
        .from("executor_tasks")
        .insert({
          project_id,
          action: "generate_stabu",
          status: "open",
          assigned_to: "executor",
          payload: { project_id },
          created_at: now
        })

      if (taskError) {
        throw new Error(`GENERATE_STABU_TASK_FAILED: ${taskError.message}`)
      }

      console.log("[PROJECT_SCAN] generate_stabu task created")
    }

    /* TASK → COMPLETED */
    await supabase
      .from("executor_tasks")
      .update({
        status: "completed",
        finished_at: now
      })
      .eq("id", taskId)

    console.log("[PROJECT_SCAN] COMPLETED")

  } catch (err) {
    console.error("[PROJECT_SCAN] ERROR", err)

    await supabase
      .from("executor_tasks")
      .update({
        status: "failed",
        error: err.message,
        finished_at: new Date().toISOString()
      })
      .eq("id", taskId)

    await supabase
      .from("executor_errors")
      .insert({
        task_id: taskId,
        project_id,
        action: "project_scan",
        error: err.message,
        stack: err.stack,
        created_at: new Date().toISOString()
      })

    await sendTelegram(
      `[PROJECT_SCAN FAILED]\nProject: ${project_id}\nError: ${err.message}`
    )
  }
}

import { createClient } from "@supabase/supabase-js"

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
)

function normalizeAction(action) {
  return String(action)
    .toLowerCase()
    .replace(/[^a-z0-9_]+/g, "_")
    .replace(/^_|_$/g, "")
}

export async function dispatchTask(task) {
  if (!task || !task.actionId) {
    throw new Error("DISPATCH_TASK_MISSING_ACTION")
  }

  const action = normalizeAction(task.actionId)
  const payload = task.payload && typeof task.payload === "object"
    ? task.payload
    : {}

  const project_id = payload.project_id || task.project_id

  if (!project_id) {
    throw new Error("DISPATCH_TASK_MISSING_PROJECT_ID")
  }

  const { error } = await supabase
    .from("executor_tasks")
    .insert({
      project_id,
      action,
      payload,
      status: "open",
      assigned_to: "executor"
    })

  if (error) {
    throw new Error("DISPATCH_TASK_FAILED: " + error.message)
  }

  return {
    state: "QUEUED",
    action,
    project_id
  }
}

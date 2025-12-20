import { createClient } from "@supabase/supabase-js"

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
)

export async function dispatchTask(task) {
  await supabase.from("tasks").insert({
    type: task.actionId,
    status: "open",
    payload: task.payload,
    assigned_to: "executor"
  })
}

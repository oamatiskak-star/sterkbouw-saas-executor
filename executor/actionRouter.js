import { runBuilder } from "../builder/index.js"
import { createClient } from "@supabase/supabase-js"

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
)

export async function runAction(task) {
  const payload = task.payload || {}
  const actionId = payload.actionId

  if (!actionId) {
    return { status: "ignored", reason: "NO_ACTION_ID" }
  }

  const { data: gate } = await supabase
    .from("deploy_gate")
    .select("*")
    .eq("id", 1)
    .single()

  if (actionId.startsWith("frontend:") && !gate.allow_frontend) {
    return { status: "blocked", reason: "FRONTEND_GATE_CLOSED" }
  }

  if (actionId.startsWith("builder:") && !gate.allow_build) {
    return { status: "blocked", reason: "BUILD_GATE_CLOSED" }
  }

  return await runBuilder({ actionId, ...payload })
}

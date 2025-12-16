import { createClient } from "@supabase/supabase-js"
import * as calculatiesBouw from "./actions/calculaties_bouw.js"
import * as calculatiesEW from "./actions/calculaties_ew.js"

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
)

const ACTIONS = {
  "calculaties:bouw": calculatiesBouw,
  "calculaties:ew": calculatiesEW
}

export async function runBuilder(task = {}) {
  const actionId =
    task.payload?.action ||
    task.action ||
    task.type

  const projectId = task.project_id || null

  console.log("BUILDER START", actionId || "GEEN_ACTION")

  if (!actionId) {
    return logResult({
      projectId,
      actionId: "onbekend",
      status: "SKIP",
      message: "Geen action beschikbaar"
    })
  }

  const handler = ACTIONS[actionId]

  if (!handler || typeof handler.run !== "function") {
    return logResult({
      projectId,
      actionId,
      status: "SKIP",
      message: "Geen builder-actie voor deze taak"
    })
  }

  try {
    const result = await handler.run({
      project_id: projectId,
      task
    })

    return logResult({
      projectId,
      actionId,
      status: "DONE",
      data: result
    })
  } catch (err) {
    return logResult({
      projectId,
      actionId,
      status: "FAILED",
      message: err.message || "BUILDER_FOUT"
    })
  }
}

async function logResult({ projectId, actionId, status, data, message }) {
  const record = {
    project_id: projectId,
    action: actionId,
    status,
    data: data || null,
    message: message || null,
    created_at: new Date().toISOString()
  }

  console.log("BUILDER RESULT", status, actionId)

  await supabase.from("builder_results").insert(record)

  return record
}

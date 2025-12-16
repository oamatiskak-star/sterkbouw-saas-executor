import { createClient } from "@supabase/supabase-js"
import * as calculatiesBouw from "./actions/calculaties_bouw.js"
import * as calculatiesEW from "./actions/calculaties_ew.js"
import { generateModule } from "./moduleGenerator.js"

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
)

/*
========================
BUILDER ACTION MAP
========================
– Bestaande acties blijven werken
– Nieuwe generatieve actie toegevoegd
*/
const ACTIONS = {
  "calculaties:bouw": calculatiesBouw,
  "calculaties:ew": calculatiesEW
}

/*
========================
BUILDER ENTRYPOINT
========================
*/
export async function runBuilder(task = {}) {
  const actionId =
    task.type ||
    task.action ||
    task.payload?.action

  const projectId = task.project_id || null

  console.log("BUILDER START", actionId || "GEEN_ACTION", "PROJECT:", projectId)

  /*
  ========================
  GENERATIEVE MODULE BUILD
  ========================
  */
  if (actionId === "builder:generate_module") {
    const { module, design } = task.payload || {}

    if (!module || !design) {
      return logResult({
        projectId,
        actionId,
        status: "FAILED",
        message: "MODULE_OF_DESIGN_ONTBREEKT"
      })
    }

    try {
      await generateModule(module, design)

      return logResult({
        projectId,
        actionId,
        status: "DONE",
        data: { module }
      })
    } catch (err) {
      return logResult({
        projectId,
        actionId,
        status: "FAILED",
        message: err.message || "GENERATOR_FOUT"
      })
    }
  }

  /*
  ========================
  BESTAANDE BUILDER ACTIONS
  ========================
  */
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

/*
========================
RESULT LOGGING
========================
*/
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

  await supabase
    .from("builder_results")
    .insert(record)

  return record
}

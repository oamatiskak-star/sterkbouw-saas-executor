import fs from "fs"
import path from "path"
import { fileURLToPath } from "url"
import { createClient } from "@supabase/supabase-js"

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const ACTIONS_DIR = path.join(__dirname, "actions")

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
)

/*
========================
DYNAMIC ACTION LOADER
========================
*/
function loadActions() {
  const actions = {}

  if (!fs.existsSync(ACTIONS_DIR)) {
    fs.mkdirSync(ACTIONS_DIR, { recursive: true })
  }

  const files = fs.readdirSync(ACTIONS_DIR)

  for (const file of files) {
    if (!file.endsWith(".js")) continue
    const actionId = file.replace(".js", "").replace("__", ":")
    actions[actionId] = import(`./actions/${file}`)
  }

  return actions
}

/*
========================
AUTO ACTION GENERATOR
========================
*/
function generateActionFile(actionId) {
  const fileName = actionId.replace(":", "__") + ".js"
  const filePath = path.join(ACTIONS_DIR, fileName)

  if (fs.existsSync(filePath)) return

  const [module, action] = actionId.split(":")

  const template = `
import { createClient } from "@supabase/supabase-js"

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
)

export async function run({ project_id, payload }) {
  console.log("AUTO BUILDER START ${actionId}", project_id)

  const result = {
    module: "${module}",
    action: "${action}",
    status: "auto-generated",
    payload
  }

  await supabase.from("builder_results").insert({
    project_id,
    action: "${actionId}",
    status: "DONE",
    data: result,
    created_at: new Date().toISOString()
  })

  console.log("AUTO BUILDER DONE ${actionId}")
  return result
}
`
  fs.writeFileSync(filePath, template.trim())
}

/*
========================
BUILDER RUNNER
========================
*/
export async function runBuilder(payload = {}) {
  const actionId = payload.action
  const projectId = payload.project_id || null

  console.log("BUILDER START", actionId)

  if (!actionId) {
    return
  }

  generateActionFile(actionId)

  const actions = loadActions()

  const actionModulePromise = actions[actionId]

  if (!actionModulePromise) {
    console.log("BUILDER KON ACTIE NIET LADEN", actionId)
    return
  }

  const actionModule = await actionModulePromise

  if (typeof actionModule.run !== "function") {
    console.log("BUILDER RUN FUNCTIE ONTBREEKT", actionId)
    return
  }

  try {
    const result = await actionModule.run({
      project_id: projectId,
      payload
    })

    console.log("BUILDER RESULT DONE", actionId)
    return result
  } catch (err) {
    console.error("BUILDER ERROR", actionId, err.message)

    await supabase.from("builder_results").insert({
      project_id: projectId,
      action: actionId,
      status: "FAILED",
      message: err.message,
      created_at: new Date().toISOString()
    })
  }
}

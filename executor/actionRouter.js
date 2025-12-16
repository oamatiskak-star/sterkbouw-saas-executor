// executor/actionRouter.js

import { createClient } from "@supabase/supabase-js"
import path from "path"

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
)

export async function runAction(actionId, payload) {
  const { data, error } = await supabase
    .from("action_map")
    .select("*")
    .eq("action_id", actionId)
    .single()

  if (error || !data) {
    console.error("❌ Action niet gevonden in action_map:", error || actionId)
    throw new Error("ONBEKENDE_ACTION")
  }

  const { module_path, function_name } = data
  const moduleFullPath = path.resolve(`./${module_path}`)
  const importedModule = await import(moduleFullPath)

  if (!importedModule[function_name]) {
    throw new Error(`Functie ${function_name} niet gevonden in ${module_path}`)
  }

  return await importedModule[function_name](payload)
}

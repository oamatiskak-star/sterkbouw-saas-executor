import { createClient } from "@supabase/supabase-js"
import { getDesignContract } from "./designContracts.js"

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
)

export async function designMissingModules(projectId) {
  const { data: modules } = await supabase
    .from("module_registry")
    .select("*")

  for (const module of modules) {
    const design = getDesignContract(module.key)

    await supabase.from("tasks").insert({
      type: "builder:generate_module",
      assigned_to: "executor",
      status: "open",
      project_id: projectId,
      payload: {
        module: module.key,
        design
      }
    })
  }
}

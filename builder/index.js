// builder/index.js

import { createClient } from "@supabase/supabase-js"
import { registerUnknownCommand } from "../utils/registerUnknownCommand.js"
import { generateLoginForm } from "./loginForm.js"
import { generateGenericModule } from "./moduleGenerator.js"
import { buildFullUiLayout } from "./fullUiLayout.js"

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
)

console.log("🟡 AO BUILDER gestart")

async function pollTasks() {
  const { data: tasks, error } = await supabase
    .from("tasks")
    .select("*")
    .eq("status", "open")
    .eq("assigned_to", "builder")

  if (error) {
    console.error("❌ Fout bij ophalen taken:", error)
    return
  }

  for (const task of tasks) {
    const { id, action_id, payload } = task

    try {
      console.log(`🛠️ Verwerk taak: ${action_id}`)

      switch (action_id) {
        case "builder:generate_login_form":
          await generateLoginForm(payload)
          break

        case "builder:generate_generic":
          await generateGenericModule(payload)
          break

        case "frontend:full_ui_layout":
          await buildFullUiLayout(payload)
          break

        default:
          await registerUnknownCommand(action_id, "builder")
          throw new Error(`ONBEKENDE_ACTION: ${action_id}`)
      }

      await supabase.from("tasks").update({ status: "done" }).eq("id", id)
      console.log(`✅ Builder-taak afgerond: ${action_id}`)

    } catch (err) {
      console.error(`❌ Fout bij builder-taak ${action_id}:`, err)
      await supabase.from("tasks").update({ status: "failed" }).eq("id", id)
    }
  }
}

setInterval(pollTasks, 5000)

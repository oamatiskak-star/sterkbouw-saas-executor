// architect/index.js
import { createClient } from "@supabase/supabase-js"

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
)

/*
ARCHITECT
- LEEST ALLEEN UIT SUPABASE
- GEEN FILE IMPORTS
- GEEN TASK LOGICA
- GEEN BUILD
- KAN NOOIT CRASHEN OP FILES
*/

export async function handleArchitectTask(taskId, payload) {
  // Architect registreert alleen dat de taak bestaat
  // Uitvoering gebeurt door executor/builder via SQL

  const { error } = await supabase
    .from("architect_logs")
    .insert({
      task_id: taskId,
      payload,
      status: "acknowledged"
    })

  if (error) {
    throw new Error("ARCHITECT_DB_ERROR: " + error.message)
  }

  return {
    ok: true,
    task: taskId,
    handled_by: "architect",
    mode: "sql-driven"
  }
}

// architect/index.js

import { createClient } from "@supabase/supabase-js"

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
)

/*
ARCHITECT
- PASSIEF
- GEEN FILE IMPORTS
- GEEN TASK LOGICA
- GEEN BUILD
- VOLDOET AAN ao.js CONTRACT
*/

export async function handleArchitectTask(taskId, payload) {
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

/*
DIT IS DE CRUCIALE FIX
ao.js verwacht deze export.
Architect hoeft niets te loopen,
maar de functie moet bestaan.
*/

export async function startArchitectLoop() {
  console.log("ARCHITECT LOOP STARTED (PASSIVE MODE)")
  return true
}

import * as dotenv from "dotenv"
dotenv.config()

import express from "express"
import { createClient } from "@supabase/supabase-js"

const app = express()
const PORT = process.env.PORT || 10000

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
)

app.get("/ping", (_, res) => {
  res.send("AO_ENGINEERING LIVE")
})

async function work() {
  const { data: tasks } = await supabase
    .from("tasks")
    .select("*")
    .eq("status", "open")
    .eq("assigned_to", "engineering")
    .limit(1)

  if (!tasks || tasks.length === 0) return
  const task = tasks[0]

  await supabase
    .from("tasks")
    .update({ status: "running" })
    .eq("id", task.id)

  const result =
    task.type === "generate_planning"
      ? {
          fases: [
            { naam: "Fundering", weken: 4 },
            { naam: "Casco", weken: 10 },
            { naam: "Afbouw", weken: 6 }
          ]
        }
      : {
          termijnen: [
            { fase: "Fundering", pct: 30 },
            { fase: "Casco", pct: 40 },
            { fase: "Afbouw", pct: 30 }
          ]
        }

  await supabase.from("results").insert({
    project_id: task.project_id,
    type: task.type,
    data: result
  })

  await supabase
    .from("tasks")
    .update({ status: "done" })
    .eq("id", task.id)
}

setInterval(work, 5000)

app.listen(PORT, () => {
  console.log("AO_ENGINEERING gestart")
})

import * as dotenv from "dotenv"
dotenv.config()

import express from "express"
import { createClient } from "@supabase/supabase-js"

const app = express()
app.use(express.json())

const PORT = process.env.PORT || 10000
const POLL = Number(process.env.AO_POLL_INTERVAL || 5000)

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
)

const ROUTING = {
  run_calculation: "calculation",
  generate_planning: "engineering",
  generate_cashflow: "engineering",
  generate_bim_quantities: "bim",
  upload_documents: "documents",
  create_project: "projects"
}

app.get("/ping", (_, res) => {
  res.send("AO_EXECUTOR DISPATCHER LIVE")
})

async function dispatch() {
  const { data: tasks } = await supabase
    .from("tasks")
    .select("*")
    .eq("status", "open")
    .is("assigned_to", null)
    .limit(5)

  if (!tasks || tasks.length === 0) return

  for (const task of tasks) {
    const target = ROUTING[task.type]
    if (!target) continue

    await supabase
      .from("tasks")
      .update({ assigned_to: target })
      .eq("id", task.id)
  }
}

setInterval(dispatch, POLL)

app.listen(PORT, () => {
  console.log("AO_EXECUTOR dispatcher gestart")
})

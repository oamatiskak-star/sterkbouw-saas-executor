import * as dotenv from "dotenv"
dotenv.config()

import express from "express"
import { createClient } from "@supabase/supabase-js"
import { randomUUID } from "crypto"

const app = express()
app.use(express.json())

const PORT = process.env.PORT || 10000
const AO_ROLE = process.env.AO_ROLE
const POLL = Number(process.env.AO_POLL_INTERVAL || 5000)

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
)

app.get("/ping", (_, res) => {
  res.send("AO WORKER OK: " + AO_ROLE)
})

async function pollTasks() {
  const { data: tasks } = await supabase
    .from("ao_tasks")
    .select("*")
    .eq("executor", AO_ROLE)
    .eq("status", "pending")
    .order("created_at", { ascending: true })
    .limit(1)

  if (!tasks || tasks.length === 0) return

  const task = tasks[0]

  await supabase
    .from("ao_tasks")
    .update({ status: "running" })
    .eq("id", task.id)

  try {
    let result = null

    if (AO_ROLE === "projects" && task.action === "init") {
      const { data } = await supabase
        .rpc("get_or_create_project", { p_projectnaam: task.project_name })

      result = { project_id: data }
    }

    if (AO_ROLE === "calculation" && task.action === "start") {
      result = {
        calculation_id: randomUUID(),
        status: "started"
      }
    }

    if (AO_ROLE === "engineering") {
      result = {
        planning: ["fundering", "casco", "afbouw"],
        weken: [4, 10, 6]
      }
    }

    if (AO_ROLE === "bim") {
      result = {
        status: "wachten op model"
      }
    }

    await supabase.from("results").insert({
      project_id: (
        await supabase
          .from("projects")
          .select("id")
          .eq("projectnaam", task.project_name)
          .single()
      ).data.id,
      executor: AO_ROLE,
      result
    })

    await supabase
      .from("ao_tasks")
      .update({ status: "done", result })
      .eq("id", task.id)

  } catch (err) {
    await supabase
      .from("ao_tasks")
      .update({ status: "error", result: { error: err.message } })
      .eq("id", task.id)
  }
}

setInterval(pollTasks, POLL)

app.listen(PORT, () => {
  console.log("AO WORKER gestart:", AO_ROLE)
})

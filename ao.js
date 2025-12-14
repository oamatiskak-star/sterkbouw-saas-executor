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

app.get("/ping", (_, res) => {
  res.send("AO_EXECUTOR LIVE")
})

async function work() {
  const { data: tasks } = await supabase
    .from("tasks")
    .select("*")
    .eq("status", "open")
    .order("created_at", { ascending: true })
    .limit(1)

  if (!tasks || tasks.length === 0) return

  const task = tasks[0]

  await supabase
    .from("tasks")
    .update({ status: "running", assigned_to: "executor" })
    .eq("id", task.id)

  try {
    let result = null

    if (task.type === "create_project") {
      result = { ok: true }
    }

    if (task.type === "run_calculation") {
      const { data: calc } = await supabase
        .from("calculations")
        .insert({
          project_id: task.project_id,
          type: "fixed_price",
          status: "klaar",
          totaal: 1250000
        })
        .select()
        .single()

      result = calc
    }

    if (task.type === "generate_planning") {
      result = {
        fases: ["fundering", "casco", "afbouw"],
        weken: [4, 10, 6]
      }
    }

    await supabase.from("results").insert({
      calculation_id: task.calculation_id,
      type: task.type,
      data: result
    })

    await supabase
      .from("tasks")
      .update({ status: "done" })
      .eq("id", task.id)

  } catch (err) {
    await supabase
      .from("tasks")
      .update({ status: "error" })
      .eq("id", task.id)
  }
}

setInterval(work, POLL)

app.listen(PORT, () => {
  console.log("AO_EXECUTOR draait")
})

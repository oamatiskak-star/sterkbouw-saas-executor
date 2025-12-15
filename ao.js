import * as dotenv from "dotenv"
dotenv.config()

import express from "express"
import { createClient } from "@supabase/supabase-js"
import { spawn } from "child_process"

const AO_ROLE = process.env.AO_ROLE
const PORT = process.env.PORT || 10000
const BUILDER_PATH = process.env.AO_BUILDER_PATH

const app = express()

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
)

app.get("/ping", (_, res) => {
  res.send("AO LIVE : " + AO_ROLE)
})

/*
========================
AO ARCHITECT
========================
– LEEST ALLEEN
– GEEN TASK MUTATIES
– GEEN LOOPS
– GEEN EXECUTIE
*/
if (AO_ROLE === "ARCHITECT") {
  console.log("AO ARCHITECT gestart")
  console.log("Modus: analyse en ontwerp")
}

/*
========================
AO EXECUTOR
========================
– ENIGE DIE UITVOERT
– VERWERKT TASKS
– START BUILDER
*/
if (AO_ROLE === "EXECUTOR") {
  console.log("AO EXECUTOR gestart")

  async function handleDocuments(task) {
    console.log("DOCUMENTS task", task.id)

    await supabase
      .from("tasks")
      .update({ status: "running" })
      .eq("id", task.id)

    await supabase.from("results").insert({
      project_id: task.project_id,
      type: "documents_processed",
      data: { ok: true }
    })

    await supabase
      .from("tasks")
      .update({ status: "done" })
      .eq("id", task.id)
  }

  async function handleBuilder(task) {
    console.log("RUN_BUILDER task", task.id)

    if (!BUILDER_PATH) {
      console.error("AO_BUILDER_PATH ontbreekt")
      await supabase
        .from("tasks")
        .update({ status: "failed" })
        .eq("id", task.id)
      return
    }

    await supabase
      .from("tasks")
      .update({ status: "running" })
      .eq("id", task.id)

    const child = spawn(
      "node",
      [BUILDER_PATH],
      {
        stdio: "inherit",
        env: process.env
      }
    )

    child.on("exit", async (code) => {
      console.log("Builder exit code", code)

      await supabase
        .from("tasks")
        .update({
          status: code === 0 ? "done" : "failed"
        })
        .eq("id", task.id)
    })
  }

  async function pollTasks() {
    const { data: tasks } = await supabase
      .from("tasks")
      .select("*")
      .eq("status", "open")
      .eq("assigned_to", "executor")
      .order("created_at", { ascending: true })
      .limit(1)

    if (!tasks || tasks.length === 0) return

    const task = tasks[0]

    if (task.type === "DOCUMENTS") {
      await handleDocuments(task)
    }

    if (task.type === "RUN_BUILDER") {
      await handleBuilder(task)
    }
  }

  setInterval(pollTasks, 5000)
}

/*
========================
SAFETY NET
========================
*/
if (!AO_ROLE) {
  console.error("AO_ROLE ontbreekt. Service stopt.")
  process.exit(1)
}

app.listen(PORT, () => {
  console.log("AO service live op poort", PORT)
})

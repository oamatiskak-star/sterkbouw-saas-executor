import express from "express"
import { createClient } from "@supabase/supabase-js"

import { runAction } from "./actionRouter.js"
import { startArchitectLoop } from "./architect/index.js"
import { startArchitectSystemScan } from "./architect/systemScanner.js"
import { startForceBuild } from "./architect/forceBuild.js"

/*
========================
BASIS CONFIG
========================
*/
const AO_ROLE = process.env.AO_ROLE
const PORT = process.env.PORT || 8080

if (!AO_ROLE) {
  console.error("AO_ROLE ontbreekt")
  process.exit(1)
}

/*
========================
WRITE FLAG
========================
*/
const ENABLE_FRONTEND_WRITE =
  process.env.ENABLE_FRONTEND_WRITE === "true"

/*
========================
APP + SUPABASE
========================
*/
const app = express()
app.use(express.json())

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
)

/*
========================
PING
========================
*/
app.get("/", (_, res) => {
  res.send("OK")
})

app.get("/ping", (_, res) => {
  res.send("AO LIVE : " + AO_ROLE)
})

/*
========================
EXECUTOR LOOP
========================
*/
if (AO_ROLE === "EXECUTOR" || AO_ROLE === "AO_EXECUTOR") {
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

    await supabase
      .from("tasks")
      .update({ status: "running" })
      .eq("id", task.id)

    try {
      if (task.type === "architect:system_full_scan") {
        await startArchitectSystemScan()
      } else if (task.type === "architect:force_build") {
        await startForceBuild(task.project_id)
      } else {
        if (
          task.type.startsWith("generate_") ||
          task.type.startsWith("builder_")
        ) {
          if (!ENABLE_FRONTEND_WRITE) {
            throw new Error("FRONTEND_WRITE_DISABLED")
          }
        }

        await runAction({
          ...task.payload,
          task_id: task.id,
          project_id: task.project_id
        })
      }

      await supabase
        .from("tasks")
        .update({ status: "done" })
        .eq("id", task.id)

    } catch (err) {
      await supabase
        .from("tasks")
        .update({
          status: "failed",
          error: err.message
        })
        .eq("id", task.id)
    }
  }

  setInterval(pollTasks, 3000)
}

/*
========================
ARCHITECT LOOP
========================
*/
if (AO_ROLE === "ARCHITECT") {
  startArchitectLoop()
}

/*
========================
SERVER START
========================
*/
app.listen(PORT, () => {
  console.log("AO SERVICE LIVE")
  console.log("ROLE:", AO_ROLE)
  console.log("PORT:", PORT)
})

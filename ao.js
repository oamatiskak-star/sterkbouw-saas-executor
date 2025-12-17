import express from "express"
import { createClient } from "@supabase/supabase-js"

import { runAction } from "./executor/actionRouter.js"
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
  console.error("AO_ROLE ontbreekt. Service stopt.")
  process.exit(1)
}

/*
========================
FRONTEND WRITE FLAG
ENIGE WAARHEID
========================
*/
const ENABLE_FRONTEND_WRITE =
  process.env.ENABLE_FRONTEND_WRITE === "true"

console.log("ENABLE_FRONTEND_WRITE (env):", process.env.ENABLE_FRONTEND_WRITE)
console.log("FRONTEND WRITE ENABLED:", ENABLE_FRONTEND_WRITE)

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
app.get("/ping", (_, res) => {
  res.send("AO LIVE : " + AO_ROLE)
})

/*
========================
ARCHITECT LOOP
========================
*/
if (AO_ROLE === "ARCHITECT") {
  console.log("AO ARCHITECT gestart")
  console.log("Modus: autonoom ontwerpen")
  startArchitectLoop()
}

/*
========================
EXECUTOR LOOP
========================
*/
if (AO_ROLE === "EXECUTOR" || AO_ROLE === "AO_EXECUTOR") {
  console.log("AO EXECUTOR gestart")
  console.log("WRITE MODE: ACTIEF")

  async function pollTasks() {
    try {
      const { data: tasks, error } = await supabase
        .from("tasks")
        .select("id, type, payload, status, assigned_to, project_id")
        .eq("status", "open")
        .eq("assigned_to", "executor")
        .order("created_at", { ascending: true })
        .limit(1)

      if (error) {
        console.error("Task poll error:", error.message)
        return
      }

      if (!tasks || tasks.length === 0) return

      const task = tasks[0]
      console.log("EXECUTOR TASK OPGEPIKT:", task.type)

      await supabase
        .from("tasks")
        .update({ status: "running" })
        .eq("id", task.id)

      try {
        if (task.type === "architect:system_full_scan") {
          console.log("ARCHITECT SYSTEM FULL SCAN START")
          await startArchitectSystemScan()
        } 
        else if (task.type === "architect:force_build") {
          console.log("ARCHITECT FORCE BUILD START")
          await startForceBuild(task.project_id)
        } 
        else {
          if (
            task.type.startsWith("generate_") ||
            task.type.startsWith("builder_")
          ) {
            if (!ENABLE_FRONTEND_WRITE) {
              throw new Error("FRONTEND_WRITE_DISABLED")
            }
          }

          console.log("RUN ACTION:", task.type)
          const result = await runAction(task)
          console.log("ACTION RESULT:", result)
        }

        await supabase
          .from("tasks")
          .update({ status: "done" })
          .eq("id", task.id)

      } catch (err) {
        console.error("TASK FOUT:", err)

        await supabase
          .from("tasks")
          .update({
            status: "failed",
            error: err.message || "ONBEKENDE_FOUT"
          })
          .eq("id", task.id)
      }

    } catch (outerErr) {
      console.error("POLL LOOP FOUT:", outerErr)
    }
  }

  setInterval(pollTasks, 3000)
}

/*
========================
SERVER START
========================
*/
app.listen(PORT, () => {
  console.log("AO SERVICE LIVE")
  console.log("ROLE:", AO_ROLE)
  console.log("POORT:", PORT)
})

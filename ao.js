import * as dotenv from "dotenv"
dotenv.config()

import express from "express"
import { createClient } from "@supabase/supabase-js"
import fs from "fs"
import path from "path"
import { execSync } from "child_process"

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

  /*
  ========================
  FRONTEND REPO CLONE
  ========================
  */
  const FRONTEND_ROOT =
    process.env.FRONTEND_ROOT || "./tmp/sterkbouw-saas-front"

  console.log("▶ FRONTEND_ROOT =", FRONTEND_ROOT)

  if (!process.env.GITHUB_TOKEN) {
    console.error("GITHUB_TOKEN ontbreekt. Executor stopt.")
    process.exit(1)
  }

  if (!fs.existsSync(FRONTEND_ROOT)) {
    console.log("▶ Frontend repo niet gevonden, clonen gestart")

    fs.mkdirSync(path.dirname(FRONTEND_ROOT), { recursive: true })

    execSync(
      `git clone https://x-access-token:${process.env.GITHUB_TOKEN}@github.com/oamatiskak-star/sterkbouw-saas-front.git ${FRONTEND_ROOT}`,
      { stdio: "inherit" }
    )

    console.log("▶ Frontend repo succesvol gekloond")
  } else {
    console.log("▶ Frontend repo al aanwezig")
    console.log("▶ Inhoud:", fs.readdirSync(FRONTEND_ROOT))
  }

  /*
  ========================
  TASK POLLER
  ========================
  */
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
        } else if (task.type === "architect:force_build") {
          console.log("ARCHITECT FORCE BUILD START")
          await startForceBuild(task.project_id)
        } else {
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

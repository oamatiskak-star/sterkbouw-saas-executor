import express from "express"
import { createClient } from "@supabase/supabase-js"

// 🔴 ENIGE AANPASSING: PADEN EXPLICIET NAAR /executor
import { runAction } from "./executor/actionRouter.js"
import { startArchitectLoop } from "./executor/architect/index.js"
import { startArchitectSystemScan } from "./executor/architect/systemScanner.js"
import { startForceBuild } from "./executor/architect/forceBuild.js"

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
ROOT + PING
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
UI API – KNOPPENMATRIX
========================
*/
app.get("/api/ui/:page_slug", async (req, res) => {
  const { page_slug } = req.params

  const { data, error } = await supabase
    .from("page_buttons")
    .select(`
      sort_order,
      ui_buttons (
        label,
        icon,
        action_type,
        action_target,
        variant
      )
    `)
    .eq("page_slug", page_slug)
    .order("sort_order", { ascending: true })

  if (error) {
    console.error("UI API ERROR:", error.message)
    return res.status(500).json({ ok: false, error: error.message })
  }

  const buttons = (data || []).map(row => ({
    label: row.ui_buttons.label,
    icon: row.ui_buttons.icon,
    type: row.ui_buttons.action_type || "route",
    action: row.ui_buttons.action_target,
    style: row.ui_buttons.variant || "primary"
  }))

  res.json({
    ok: true,
    components: [
      {
        type: "action_group",
        config: {
          title: "Acties",
          buttons,
          ui: {
            wrapper: "card",
            shadow: "soft",
            buttons: {
              primary: { bg: "#F5C400", text: "#000", radius: 10 },
              secondary: { bg: "#EEF1F6", text: "#1C2434", radius: 10 },
              danger: { bg: "#E5533D", text: "#fff", radius: 10 }
            }
          }
        }
      }
    ]
  })
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
  console.log("WRITE MODE:", ENABLE_FRONTEND_WRITE ? "ACTIEF" : "UIT")

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
      console.log("EXECUTOR TASK OPGEPIKT:", task.type, task.id)

      await supabase
        .from("tasks")
        .update({ status: "running" })
        .eq("id", task.id)

      try {
        if (task.type === "architect:system_full_scan") {
          console.log("ARCHITECT SYSTEM FULL SCAN START")
          await startArchitectSystemScan()
        } else if (task.type === "architect:force_build") {
          console.log("ARCHITECT FORCE BUILD START:", task.project_id)
          await startForceBuild(task.project_id)
        } else {
          if (
            task.type.startsWith("generate_") ||
            task.type.startsWith("builder_") ||
            task.payload?.actionId?.startsWith("frontend_")
          ) {
            if (!ENABLE_FRONTEND_WRITE) {
              throw new Error("FRONTEND_WRITE_DISABLED")
            }
          }

          const actionPayload = {
            ...task.payload,
            task_id: task.id,
            project_id: task.project_id
          }

          console.log("RUN ACTION:", actionPayload.actionId)
          const result = await runAction(actionPayload)
          console.log("ACTION RESULT:", result)
        }

        await supabase
          .from("tasks")
          .update({ status: "done" })
          .eq("id", task.id)

        console.log("TASK DONE:", task.id)

      } catch (err) {
        console.error("TASK FOUT:", err.message)

        await supabase
          .from("tasks")
          .update({
            status: "failed",
            error: err.message || "ONBEKENDE_FOUT"
          })
          .eq("id", task.id)
      }

    } catch (outerErr) {
      console.error("POLL LOOP FOUT:", outerErr.message)
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
  console.log("===================================")
  console.log("AO SERVICE LIVE")
  console.log("ROLE:", AO_ROLE)
  console.log("PORT:", PORT)
  console.log("FRONTEND WRITE:", ENABLE_FRONTEND_WRITE)
  console.log("SUPABASE URL SET:", !!process.env.SUPABASE_URL)
  console.log("===================================")
})

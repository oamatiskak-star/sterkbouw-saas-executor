import express from "express"
import { createClient } from "@supabase/supabase-js"

// BESTAANDE BESTANDEN – ECHTE PADEN
import { runAction } from "./executor/actionRouter.js"
import { architectFullUiBuild } from "./actions/architectFullUiBuild.js"
import { startArchitectSystemScan } from "./architect/systemScanner.js"
import { startForceBuild } from "./architect/forceBuild.js"

/*
========================
STRICT MODE CONFIG
========================
*/
const STRICT_MODE = true

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

if (!process.env.SUPABASE_URL) {
  throw new Error("ENV_MISSING_SUPABASE_URL")
}

if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
  throw new Error("ENV_MISSING_SUPABASE_SERVICE_ROLE_KEY")
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
UTILS
========================
*/
function assert(condition, code) {
  if (!condition) throw new Error(code)
}

/*
========================
PING
========================
*/
app.get("/", (_, res) => res.send("OK"))
app.get("/ping", (_, res) => res.send("AO LIVE : " + AO_ROLE))

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
    return res.status(500).json({ ok: false, error: error.message })
  }

  res.json({
    ok: true,
    components: [
      {
        type: "action_group",
        config: {
          title: "Acties",
          buttons: (data || []).map(r => ({
            label: r.ui_buttons.label,
            icon: r.ui_buttons.icon,
            type: r.ui_buttons.action_type || "route",
            action: r.ui_buttons.action_target,
            style: r.ui_buttons.variant || "primary"
          }))
        }
      }
    ]
  })
})

/*
========================
ARCHITECT MODE
========================
*/
if (AO_ROLE === "ARCHITECT") {
  console.log("AO ARCHITECT gestart")

  architectFullUiBuild({
    payload: {
      pages: [
        { route: "dashboard", title: "Dashboard" },
        { route: "projecten", title: "Projecten" }
      ]
    }
  })
}

/*
========================
EXECUTOR MODE – STRICT
========================
*/
if (AO_ROLE === "EXECUTOR" || AO_ROLE === "AO_EXECUTOR") {
  console.log("AO EXECUTOR gestart")
  console.log("STRICT MODE:", STRICT_MODE)

  async function pollTasks() {
    const { data: tasks, error } = await supabase
      .from("tasks")
      .select("*")
      .eq("status", "open")
      .eq("assigned_to", "executor")
      .order("created_at", { ascending: true })
      .limit(1)

    if (error || !tasks || tasks.length === 0) return

    const task = tasks[0]

    console.log("TASK_START", task.id, task.type)

    try {
      assert(task.status === "open", "TASK_NOT_OPEN")
      assert(task.type, "TASK_TYPE_MISSING")

      await supabase
        .from("tasks")
        .update({ status: "running" })
        .eq("id", task.id)

      /*
      ========================
      ARCHITECT TASKS
      ========================
      */
      if (task.type === "architect:system_full_scan") {
        await startArchitectSystemScan()
      }

      else if (task.type === "architect:force_build") {
        await startForceBuild(task.project_id)
      }

      /*
      ========================
      ROUTE VALIDATIE TASKS
      ========================
      */
      else if (
        task.type === "route:validate" ||
        task.type === "ui:route"
      ) {
        const route = task.payload?.route
        assert(route, "ROUTE_MISSING_IN_PAYLOAD")

        const { data: page } = await supabase
          .from("pages")
          .select("id")
          .eq("route", route)
          .maybeSingle()

        assert(page, "ROUTE_NOT_FOUND_IN_PAGES")
      }

      /*
      ========================
      ACTION TASKS
      ========================
      */
      else {
        assert(task.action_id, "ACTION_ID_MISSING")

        if (
          task.type.startsWith("frontend_") &&
          ENABLE_FRONTEND_WRITE !== true
        ) {
          throw new Error("FRONTEND_WRITE_DISABLED")
        }

        await runAction(task)
      }

      await supabase
        .from("tasks")
        .update({
          status: "done",
          finished_at: new Date().toISOString()
        })
        .eq("id", task.id)

      console.log("TASK_DONE", task.id)

    } catch (err) {
      console.error("TASK_FAILED", task.id, err.message)

      await supabase
        .from("tasks")
        .update({
          status: "failed",
          error: err.message,
          finished_at: new Date().toISOString()
        })
        .eq("id", task.id)

      if (STRICT_MODE) return
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
  console.log("PORT:", PORT)
})

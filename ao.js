import express from "express"
import { createClient } from "@supabase/supabase-js"

console.log("AO ENTRYPOINT ao.js LOADED")

import { runAction } from "./executor/actionRouter.js"
import { architectFullUiBuild } from "./actions/architectFullUiBuild.js"
import { startArchitectSystemScan } from "./architect/systemScanner.js"
import { startForceBuild } from "./architect/forceBuild.js"

import { handleTelegramWebhook } from "./integrations/telegramWebhook.js"
import { sendTelegram } from "./integrations/telegramSender.js"

/*
========================
CONFIG
========================
*/
const AO_ROLE = process.env.AO_ROLE
const PORT = process.env.PORT || 8080

if (!AO_ROLE) {
  console.error("ENV_MISSING_AO_ROLE")
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
APP INIT
========================
*/
const app = express()
app.use(express.json({ type: "*/*" }))

app.use((req, _res, next) => {
  console.log("INCOMING_REQUEST", req.method, req.path)
  next()
})

/*
========================
TELEGRAM WEBHOOK
========================
*/
app.get("/telegram/webhook", (_req, res) => res.status(200).send("OK"))

app.post("/telegram/webhook", async (req, res) => {
  try {
    await handleTelegramWebhook(req.body)
  } catch (err) {
    console.error("TELEGRAM_WEBHOOK_ERROR", err.message)
  }
  res.sendStatus(200)
})

/*
========================
SUPABASE
========================
*/
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
)

/*
========================
BASIC ROUTES
========================
*/
app.get("/", (_req, res) => res.send("OK"))
app.get("/ping", (_req, res) => res.send("AO LIVE : " + AO_ROLE))

/*
========================
ARCHITECT STARTUP TASK
========================
*/
if (AO_ROLE === "ARCHITECT") {
  console.log("ARCHITECT STARTUP UI BUILD")

  architectFullUiBuild({
    id: "startup_architect",
    payload: {
      pages: [
        { route: "dashboard", title: "Dashboard" },
        { route: "projecten", title: "Projecten" }
      ]
    }
  }).catch(err => {
    console.error("ARCHITECT_STARTUP_ERROR", err.message)
  })
}

/*
========================
LEGACY TASK POLL
========================
*/
async function pollLegacyTasks() {
  const { data: tasks } = await supabase
    .from("tasks")
    .select("*")
    .eq("status", "open")
    .eq("assigned_to", "executor")
    .limit(1)

  if (!tasks || tasks.length === 0) return

  const task = tasks[0]

  try {
    await supabase.from("tasks").update({ status: "running" }).eq("id", task.id)

    if (task.type === "architect:system_full_scan") {
      await startArchitectSystemScan()
    } else if (task.type === "architect:force_build") {
      await startForceBuild(task.project_id)
    } else {
      await runAction(task)
    }

    await supabase
      .from("tasks")
      .update({
        status: "done",
        finished_at: new Date().toISOString()
      })
      .eq("id", task.id)

  } catch (err) {
    await supabase
      .from("tasks")
      .update({
        status: "failed",
        error: err.message,
        finished_at: new Date().toISOString()
      })
      .eq("id", task.id)
  }
}

/*
========================
EXECUTOR_TASKS POLL
========================
*/
async function pollExecutorTasks() {
  const { data: tasks } = await supabase
    .from("executor_tasks")
    .select("*")
    .eq("status", "open")
    .or("assigned_to.eq.executor,assigned_to.is.null")
    .order("created_at", { ascending: true })
    .limit(1)

  if (!tasks || tasks.length === 0) return

  const task = tasks[0]

  console.log("EXECUTOR_TASK_PICKED", task.action, task.id)

  try {
    await supabase
      .from("executor_tasks")
      .update({
        status: "running",
        started_at: new Date().toISOString()
      })
      .eq("id", task.id)

    await runAction(task)

    await supabase
      .from("executor_tasks")
      .update({
        status: "done",
        finished_at: new Date().toISOString()
      })
      .eq("id", task.id)

  } catch (err) {
    console.error("EXECUTOR_TASK_ERROR", err.message)

    await supabase
      .from("executor_tasks")
      .update({
        status: "failed",
        error: err.message,
        finished_at: new Date().toISOString()
      })
      .eq("id", task.id)
  }
}

/*
========================
EXECUTOR LOOP
========================
*/
if (AO_ROLE === "EXECUTOR" || AO_ROLE === "AO_EXECUTOR") {
  console.log("AO EXECUTOR gestart")

  setInterval(async () => {
    await pollLegacyTasks()
    await pollExecutorTasks()
  }, 3000)

  process.stdin.resume()
}

/*
========================
SERVER START
========================
*/
app.listen(PORT, "0.0.0.0", async () => {
  console.log("AO SERVICE LIVE", AO_ROLE, PORT)

  if (process.env.TELEGRAM_CHAT_ID) {
    try {
      await sendTelegram(
        process.env.TELEGRAM_CHAT_ID,
        `AO LIVE\nRole: ${AO_ROLE}\nPort: ${PORT}`
      )
    } catch (_) {}
  }
})

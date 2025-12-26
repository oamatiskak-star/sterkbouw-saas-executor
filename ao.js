import express from "express"
import { createClient } from "@supabase/supabase-js"

import { runAction } from "./executor/actionRouter.js"
import { handleTelegramWebhook } from "./integrations/telegramWebhook.js"
import { sendTelegram } from "./integrations/telegramSender.js"

console.log("AO ENTRYPOINT ao.js LOADED")

/*
========================
CONFIG
========================
*/
const AO_ROLE = process.env.AO_ROLE
const PORT = process.env.PORT || 3000

if (!AO_ROLE) throw new Error("env_missing_ao_role")
if (!process.env.SUPABASE_URL) throw new Error("env_missing_supabase_url")
if (!process.env.SUPABASE_SERVICE_ROLE_KEY)
  throw new Error("env_missing_supabase_service_role_key")

/*
========================
APP INIT
========================
*/
const app = express()

/*
========================
CORS (LOCKED)
========================
*/
app.use((req, res, next) => {
  res.setHeader("Access-Control-Allow-Origin", "*")
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS")
  res.setHeader(
    "Access-Control-Allow-Headers",
    "Content-Type,Authorization"
  )

  if (req.method === "OPTIONS") {
    return res.sendStatus(200)
  }
  next()
})

app.use(express.json({ limit: "5mb" }))

app.use((req, _res, next) => {
  console.log("INCOMING_REQUEST", req.method, req.path)
  next()
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
DEBUG
========================
*/
console.log("SUPABASE_URL =", process.env.SUPABASE_URL)
console.log(
  "SERVICE_ROLE_KEY_PREFIX =",
  process.env.SUPABASE_SERVICE_ROLE_KEY.slice(0, 12)
)

/*
========================
BASIC ROUTES
========================
*/
app.get("/", (_req, res) => res.json({ ok: true }))
app.get("/ping", (_req, res) =>
  res.json({ ok: true, role: AO_ROLE })
)

/*
========================
TELEGRAM
========================
*/
app.post("/telegram/webhook", async (req, res) => {
  try {
    await handleTelegramWebhook(req.body)
  } catch (e) {
    console.error("telegram_webhook_error", e?.message || e)
  }
  res.json({ ok: true })
})

/*
====================================================
⚠️ GEEN /upload-files ROUTE MEER
====================================================
– Upload verloopt uitsluitend via:
  frontend → /api/executor/upload-task
  → executor_tasks
  → executor/handlers/uploadFiles.js
– Geen multer
– Geen storage upload
– Geen directe DB inserts hier
====================================================
*/

/*
========================
EXECUTOR LOOP
========================
*/
async function pollExecutorTasks() {
  const { data: tasks } = await supabase
    .from("executor_tasks")
    .select("*")
    .eq("status", "open")
    .eq("assigned_to", "executor")
    .order("created_at", { ascending: true })
    .limit(1)

  if (!tasks || !tasks.length) return

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
        status: "completed",
        finished_at: new Date().toISOString()
      })
      .eq("id", task.id)

  } catch (e) {
    const errorMsg =
      e?.message ||
      e?.error ||
      (typeof e === "string" ? e : JSON.stringify(e))

    console.error("executor_task_error", errorMsg)

    await supabase
      .from("executor_tasks")
      .update({
        status: "failed",
        error: errorMsg,
        finished_at: new Date().toISOString()
      })
      .eq("id", task.id)
  }
}

if (AO_ROLE === "EXECUTOR" || AO_ROLE === "AO_EXECUTOR") {
  console.log("AO EXECUTOR STARTED")
  setInterval(pollExecutorTasks, 3000)
}

/*
========================
SERVER
========================
*/
app.listen(PORT, "0.0.0.0", async () => {
  console.log("AO SERVICE LIVE", AO_ROLE, PORT)

  if (process.env.TELEGRAM_CHAT_ID) {
    try {
      await sendTelegram(
        process.env.TELEGRAM_CHAT_ID,
        `ao live\nrole: ${AO_ROLE}\nport: ${PORT}`
      )
    } catch (_) {}
  }
})

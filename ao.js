import express from "express"
import { createClient } from "@supabase/supabase-js"

/*
========================
IMPORTS – CORE
========================
*/
import { runAction } from "./executor/actionRouter.js"
import { architectFullUiBuild } from "./actions/architectFullUiBuild.js"
import { startArchitectSystemScan } from "./architect/systemScanner.js"
import { startForceBuild } from "./architect/forceBuild.js"

/*
========================
IMPORTS – TELEGRAM
========================
*/
import { handleTelegramWebhook } from "./integrations/telegramWebhook.js"
import { sendTelegram } from "./integrations/telegramSender.js"

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
  console.error("AO_ROLE ontbreekt")
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
WRITE FLAGS
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

app.use((req, res, next) => {
  console.log("INCOMING_REQUEST", {
    method: req.method,
    path: req.path,
    contentType: req.headers["content-type"]
  })
  next()
})

app.use(express.json({ type: "*/*" }))

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
TELEGRAM WEBHOOK
========================
*/
app.post("/telegram/webhook", async (req, res) => {
  console.log("TELEGRAM_WEBHOOK_HIT_RAW", req.body)

  try {
    await handleTelegramWebhook(req.body)
  } catch (err) {
    console.error("TELEGRAM_WEBHOOK_ERROR", err.message)
  }

  res.sendStatus(200)
})

app.get("/telegram/webhook", (_, res) => {
  console.log("TELEGRAM_WEBHOOK_GET_HIT")
  res.send("OK")
})

/*
========================
SELFTEST – ÉÉN KEER
========================
*/
setTimeout(async () => {
  console.log("SELFTEST_START")

  const fakeUpdate = {
    message: {
      text: "selftest",
      chat: { id: 999 },
      from: { username: "selftest" }
    }
  }

  try {
    await handleTelegramWebhook(fakeUpdate)
    console.log("SELFTEST_DONE")
  } catch (err) {
    console.error("SELFTEST_ERROR", err.message)
  }
}, 3000)

/*
========================
ARCHITECT MODE
========================
*/
if (AO_ROLE === "ARCHITECT") {
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
EXECUTOR MODE
========================
*/
if (AO_ROLE === "EXECUTOR" || AO_ROLE === "AO_EXECUTOR") {
  console.log("AO EXECUTOR gestart")
  console.log("STRICT MODE:", STRICT_MODE)

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

    try {
      await supabase
        .from("tasks")
        .update({ status: "running" })
        .eq("id", task.id)

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

  setInterval(pollTasks, 3000)
}

/*
========================
SERVER START + TELEGRAM MELDING
========================
*/
app.listen(PORT, "0.0.0.0", async () => {
  console.log("AO SERVICE LIVE")
  console.log("ROLE:", AO_ROLE)
  console.log("PORT:", PORT)

  try {
    await sendTelegram(
      process.env.TELEGRAM_CHAT_ID,
      `AO Executor LIVE\nRole: ${AO_ROLE}\nPort: ${PORT}`
    )
  } catch (e) {
    console.error("TELEGRAM_STARTUP_NOTIFY_FAILED", e.message)
  }
})

import express from "express"
import multer from "multer"
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
CORS FIX (LOCKED)
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
MULTER
========================
*/
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 50 * 1024 * 1024 }
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
    console.error("telegram_webhook_error", e.message)
  }
  res.json({ ok: true })
})

/*
========================
UPLOAD + FLOW START
========================
*/
app.post("/upload-files", upload.array("files"), async (req, res) => {
  try {
    const project_id = req.body.project_id
    const files = req.files || []

    if (!project_id) {
      return res.status(400).json({ error: "no_project_id" })
    }

    if (!files.length) {
      return res.status(400).json({ error: "no_files" })
    }

    const analysis_log = []

    for (const file of files) {
      const storage_path = `${project_id}/${Date.now()}_${file.originalname}`

      const { error: uploadErr } = await supabase.storage
        .from("sterkcalc")
        .upload(storage_path, file.buffer, {
          contentType: file.mimetype,
          upsert: false
        })

      if (uploadErr) throw uploadErr

      const { error: dbErr } = await supabase
        .from("project_files")
        .insert({
          project_id,
          file_name: file.originalname,
          storage_path,
          bucket: "sterkcalc",
          status: "uploaded"
        })

      if (dbErr) throw dbErr

      analysis_log.push({
        file: file.originalname,
        status: "queued"
      })
    }

    await supabase
      .from("projects")
      .update({
        files_uploaded: true,
        analysis_status: "running",
        analysis_log,
        updated_at: new Date().toISOString()
      })
      .eq("id", project_id)

    await supabase.from("executor_tasks").insert({
      project_id,
      action: "project_scan",
      payload: { project_id },
      status: "open",
      assigned_to: "executor"
    })

    return res.status(200).json({
      ok: true,
      project_id,
      files: analysis_log
    })
  } catch (e) {
    console.error("upload_files_fatal", e.message)
    return res.status(500).json({ error: e.message })
  }
})

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
    console.error("executor_task_error", e.message)

    await supabase
      .from("executor_tasks")
      .update({
        status: "failed",
        error: e.message,
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

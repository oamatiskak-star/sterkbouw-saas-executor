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
const PORT = process.env.PORT || 8080

if (!AO_ROLE) throw new Error("ENV_MISSING_AO_ROLE")
if (!process.env.SUPABASE_URL) throw new Error("ENV_MISSING_SUPABASE_URL")
if (!process.env.SUPABASE_SERVICE_ROLE_KEY)
  throw new Error("ENV_MISSING_SUPABASE_SERVICE_ROLE_KEY")

/*
========================
APP INIT
========================
*/
const app = express()
app.use(express.json({ limit: "2mb" }))

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
app.get("/", (_req, res) => res.send("OK"))
app.get("/ping", (_req, res) => res.send("AO LIVE " + AO_ROLE))

/*
========================
TELEGRAM
========================
*/
app.post("/telegram/webhook", async (req, res) => {
  try {
    await handleTelegramWebhook(req.body)
  } catch (e) {
    console.error("TELEGRAM_WEBHOOK_ERROR", e.message)
  }
  res.sendStatus(200)
})

/*
========================
UPLOAD + START FLOW
========================
*/
app.post("/upload-files", upload.array("files"), async (req, res) => {
  try {
    const projectId = req.body.project_id
    const files = req.files || []

    if (!projectId) return res.status(400).json({ error: "NO_PROJECT_ID" })
    if (!files.length) return res.status(400).json({ error: "NO_FILES" })

    const analysisLog = []

    for (const file of files) {
      const storagePath = `${projectId}/${Date.now()}_${file.originalname}`

      const { error: uploadError } = await supabase.storage
        .from("sterkcalc")
        .upload(storagePath, file.buffer, {
          contentType: file.mimetype,
          upsert: false
        })

      if (uploadError) throw uploadError

      const { error: dbError } = await supabase
        .from("project_files")
        .insert({
          project_id: projectId,
          file_name: file.originalname,
          storage_path: storagePath,
          bucket: "sterkcalc",
          status: "uploaded"
        })

      if (dbError) throw dbError

      analysisLog.push({
        file_name: file.originalname,
        status: "queued"
      })
    }

    await supabase
      .from("projects")
      .update({
        files_uploaded: true,
        analysis_status: "running",
        analysis_log: analysisLog,
        updated_at: new Date().toISOString()
      })
      .eq("id", projectId)

    // PRODUCER GUARD: project_scan
    const { data: existingScan } = await supabase
      .from("executor_tasks")
      .select("id")
      .eq("project_id", projectId)
      .eq("action", "project_scan")
      .in("status", ["open", "running", "completed"])
      .limit(1)
      .maybeSingle()

    if (!existingScan) {
      await supabase.from("executor_tasks").insert({
        project_id: projectId,
        action: "project_scan",
        payload: { project_id: projectId },
        status: "open",
        assigned_to: "executor"
      })
    }

    res.json({
      ok: true,
      project_id: projectId,
      files: analysisLog.map(f => f.file_name),
      next: "project_scan"
    })
  } catch (e) {
    console.error("UPLOAD_FATAL", e.message)
    res.status(500).json({ error: e.message })
  }
})

/*
========================
EXECUTOR POLLER (STERKCALC)
========================
*/
async function pollExecutorTasks() {
  // haal oudste open task
  const { data: tasks } = await supabase
    .from("executor_tasks")
    .select("*")
    .eq("status", "open")
    .eq("assigned_to", "executor")
    .order("created_at", { ascending: true })
    .limit(1)

  if (!tasks || !tasks.length) return

  const task = tasks[0]

  // DEDUPLICATIE: annuleer andere open tasks met zelfde project + action
  await supabase
    .from("executor_tasks")
    .update({
      status: "cancelled",
      finished_at: new Date().toISOString()
    })
    .eq("project_id", task.project_id)
    .eq("action", task.action)
    .eq("status", "open")
    .neq("id", task.id)

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
    console.error("EXECUTOR_TASK_ERROR", e.message)

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

/*
========================
EXECUTOR LOOP
========================
*/
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
        `AO LIVE\nRole: ${AO_ROLE}\nPort: ${PORT}`
      )
    } catch (_) {}
  }
})

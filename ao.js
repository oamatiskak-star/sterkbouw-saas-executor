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
app.use(express.json({ type: "*/*" }))

app.use((req, _res, next) => {
  console.log("INCOMING", req.method, req.path)
  next()
})

const upload = multer({ storage: multer.memoryStorage() })

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
TELEGRAM WEBHOOK
========================
*/
app.post("/telegram/webhook", async (req, res) => {
  try {
    await handleTelegramWebhook(req.body)
  } catch (e) {
    console.error(e.message)
  }
  res.sendStatus(200)
})

/*
========================
UPLOAD FILES + START ANALYSE
POST /upload-files
FormData:
- project_id
- files[]
========================
*/
app.post("/upload-files", upload.array("files"), async (req, res) => {
  try {
    const projectId = req.body.project_id
    const files = req.files || []

    if (!projectId) return res.status(400).json({ error: "NO_PROJECT_ID" })
    if (!files.length) return res.status(400).json({ error: "NO_FILES" })

    for (const file of files) {
      const path = `${projectId}/${Date.now()}_${file.originalname}`

      const { error: uploadError } = await supabase.storage
        .from("sterkbouw")
        .upload(path, file.buffer, {
          contentType: file.mimetype,
          upsert: false
        })

      if (uploadError) throw uploadError

      const { error: dbError } = await supabase
        .from("project_files")
        .insert({
          project_id: projectId,
          filename: file.originalname,
          path,
          bucket: "sterkbouw"
        })

      if (dbError) throw dbError
    }

    await supabase
      .from("projects")
      .update({
        files_uploaded: true,
        analysis_status: "running"
      })
      .eq("id", projectId)

    await supabase.from("executor_tasks").insert({
      project_id: projectId,
      action: "project_scan",
      payload: { project_id: projectId },
      status: "open",
      assigned_to: "executor"
    })

    res.json({ ok: true, uploaded: files.length })
  } catch (e) {
    console.error("UPLOAD_FATAL", e.message)
    res.status(500).json({ error: e.message })
  }
})

/*
========================
EXECUTOR TASK LOOP
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

  try {
    await supabase
      .from("executor_tasks")
      .update({ status: "running" })
      .eq("id", task.id)

    await runAction(task)

    await supabase
      .from("executor_tasks")
      .update({ status: "done" })
      .eq("id", task.id)
  } catch (e) {
    await supabase
      .from("executor_tasks")
      .update({ status: "failed", error: e.message })
      .eq("id", task.id)
  }
}

if (AO_ROLE === "EXECUTOR") {
  setInterval(pollExecutorTasks, 3000)
}

app.listen(PORT, "0.0.0.0", () => {
  console.log("AO SERVICE LIVE", AO_ROLE, PORT)
})

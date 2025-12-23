import express from "express"
import multer from "multer"
import { createClient } from "@supabase/supabase-js"

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

// JSON alleen voor echte JSON endpoints
app.use(express.json({ limit: "2mb" }))

app.use((req, _res, next) => {
  console.log("INCOMING_REQUEST", req.method, req.path)
  next()
})

/*
========================
MULTER SETUP
========================
*/
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 50 * 1024 * 1024 // 50 MB per bestand
  }
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
TELEGRAM WEBHOOK
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
UPLOAD FILES
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

    if (!projectId) {
      return res.status(400).json({ error: "NO_PROJECT_ID" })
    }

    if (!files.length) {
      return res.status(400).json({ error: "NO_FILES" })
    }

    // Controleer of project bestaat
    const { data: project } = await supabase
      .from("projects")
      .select("id")
      .eq("id", projectId)
      .single()

    if (!project) {
      return res.status(400).json({ error: "PROJECT_NOT_FOUND" })
    }

    let uploaded = 0

    for (const file of files) {
      const storagePath = `${projectId}/${Date.now()}_${file.originalname}`

      // Upload naar Supabase Storage
      const { error: uploadError } = await supabase.storage
        .from("sterkcalc")
        .upload(storagePath, file.buffer, {
          contentType: file.mimetype,
          upsert: false
        })

      if (uploadError) {
        throw new Error(uploadError.message)
      }

      // Log in project_files
      const { error: dbError } = await supabase
        .from("project_files")
        .insert({
          project_id: projectId,
          file_name: file.originalname,
          storage_path: storagePath,
          bucket: "sterkcalc",
          status: "uploaded"
        })

      if (dbError) {
        throw new Error(dbError.message)
      }

      uploaded++
    }

    // Projectstatus bijwerken
    await supabase
      .from("projects")
      .update({
        files_uploaded: true,
        analysis_status: "completed",
        updated_at: new Date().toISOString()
      })
      .eq("id", projectId)

    res.json({
      ok: true,
      uploaded
    })
  } catch (e) {
    console.error("UPLOAD_FATAL", e.message)
    res.status(500).json({ error: e.message })
  }
})

/*
========================
EXECUTOR LOOP UITGESCHAKELD
OPTIE B – EXPLICIET
========================
*/
if (AO_ROLE === "EXECUTOR" || AO_ROLE === "AO_EXECUTOR") {
  console.log("AO EXECUTOR STARTED (TASK LOOP DISABLED)")
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

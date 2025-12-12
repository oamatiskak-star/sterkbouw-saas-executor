import * as dotenv from "dotenv"
dotenv.config()

import express from "express"
import axios from "axios"
import { sendTelegram } from "./telegram/telegram.js"
import { createClient } from "@supabase/supabase-js"
import fs from "fs"
import path from "path"
import { runRemap, enableWriteMode } from "./remap/remapEngine.js"

const app = express()
app.use(express.json())

/* =======================
   ENV VALIDATIE
======================= */
const REQUIRED_ENVS = [
  "TELEGRAM_BOT_TOKEN",
  "TELEGRAM_CHAT_ID"
]

for (const key of REQUIRED_ENVS) {
  if (!process.env[key]) {
    console.error("[AO][ENV FOUT] ontbreekt:", key)
  }
}

/* =======================
   ENV CONFIG
======================= */
const PORT = process.env.PORT || 10000
const BACKEND_URL = process.env.BACKEND_URL
const FRONTEND_URL = process.env.FRONTEND_URL
const EXECUTOR_URL = process.env.EXECUTOR_URL
const VERCEL_URL = process.env.VERCEL_URL
const SOURCE_PROJECT_URL = process.env.GITHUB_URL
const SUPABASE_URL = process.env.SUPABASE_URL
const SUPABASE_KEY = process.env.SUPABASE_KEY

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY)
let lastFrontendDeploy = 0

/* =======================
   AGENT STATE
======================= */
let sourceScan = null
let classifiedFiles = null
let remapPlan = null

/* =======================
   ROUTES
======================= */
app.get("/ping", (req, res) => {
  res.status(200).send("AO EXECUTOR OK")
})

app.post("/api/webhook", async (req, res) => {
  const commitMessage = req.body.head_commit?.message || "Geen commit message gevonden"
  console.log("[AO] Webhook ontvangen:", commitMessage)

  try {
    await sendTelegram("[AO] Webhook ontvangen: " + commitMessage)
  } catch (err) {
    console.error("[AO][TELEGRAM FOUT][WEBHOOK]", err.message)
  }

  await handleCommand(commitMessage)
  res.status(200).send("Webhook OK")
})

/* =======================
   COMMAND ROUTER
======================= */
async function handleCommand(command) {
  const lower = command.toLowerCase()

  try {
    if (lower.includes("restart agent"))
      return await sendTelegram("⏳ Agent restart wordt uitgevoerd op Render")

    if (lower.includes("ping backend"))
      return await pingURL("Backend", BACKEND_URL)

    if (lower.includes("deploy front")) {
      const mag = await vercelRateLimitCheck()
      if (mag) await sendTelegram("🚀 Deploycommando voor Frontend gestart")
      return
    }

    if (lower.includes("importeer taken")) {
      await sendTelegram("📦 Importeren van AO_MASTER_FULL_DEPLOY_CLEAN gestart")
      await importTasks()
      return
    }

    if (lower.includes("importeer supabase")) {
      await sendTelegram("📦 Supabase import gestart")
      await importSupabase()
      return
    }

    if (lower.includes("sync taken backend"))
      return await koppelNieuweModules("backend")

    if (lower.includes("sync taken frontend"))
      return await koppelNieuweModules("frontend")

    if (lower.includes("sync taken executor"))
      return await koppelNieuweModules("executor")

    if (lower.includes("activeer write mode")) {
      enableWriteMode()
      await sendTelegram("✍️ WRITE-MODE geactiveerd. Bestanden worden nu echt gekopieerd.")
      return
    }

    if (lower.includes("scan bron"))
      return await scanSource()

    if (lower.includes("classificeer bron"))
      return await classifySource()

    if (lower.includes("bouw remap plan"))
      return await buildRemapPlan()

    if (lower.includes("remap backend"))
      return await executeRemap("backend")

    if (lower.includes("remap frontend"))
      return await executeRemap("frontend")

    if (lower.includes("remap executor"))
      return await executeRemap("executor")

    await sendTelegram("⚠️ Onbekend commando:\n" + command)

  } catch (err) {
    console.error("[AO][COMMAND FOUT]", err)
    try {
      await sendTelegram("❌ AO fout:\n" + err.message)
    } catch (e) {
      console.error("[AO][TELEGRAM FATAAL]", e.message)
    }
  }
}

/* =======================
   HELPERS
======================= */
async function vercelRateLimitCheck() {
  const now = Date.now()
  const verschil = (now - lastFrontendDeploy) / 1000
  if (verschil < 60) {
    await sendTelegram("🛑 Deploy geblokkeerd:

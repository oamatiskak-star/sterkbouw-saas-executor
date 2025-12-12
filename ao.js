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
const REQUIRED_ENVS = ["TELEGRAM_BOT_TOKEN", "TELEGRAM_CHAT_ID"]

for (const key of REQUIRED_ENVS) {
  if (!process.env[key]) {
    console.error("[AO][ENV FOUT] ontbreekt:", key)
  }
}

/* =======================
   ENV CONFIG
======================= */
const PORT = process.env.PORT || 10000
const SUPABASE_URL = process.env.SUPABASE_URL
const SUPABASE_KEY = process.env.SUPABASE_KEY

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY)

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

/* GitHub webhook */
app.post("/api/webhook", async (req, res) => {
  const commitMessage = req.body?.head_commit?.message || ""
  console.log("[AO] GitHub webhook ontvangen:", commitMessage)

  try {
    await handleCommand(commitMessage)
  } catch (e) {
    console.error("[AO][GITHUB COMMAND FOUT]", e.message)
  }

  res.status(200).send("Webhook OK")
})

/* Telegram webhook */
app.post("/telegram/webhook", async (req, res) => {
  console.log("[AO] Telegram webhook HIT")

  try {
    const message = req.body?.message?.text
    const chatId = req.body?.message?.chat?.id

    if (!message || !chatId) {
      console.log("[AO] Telegram payload ongeldig")
      return res.sendStatus(200)
    }

    console.log("[AO] Telegram bericht:", message)

    await sendTelegram("📥 Ontvangen: " + message)
    await handleCommand(message)

  } catch (err) {
    console.error("[AO][TELEGRAM WEBHOOK FOUT]", err.message)
  }

  res.sendStatus(200)
})

/* =======================
   COMMAND ROUTER
======================= */
async function handleCommand(command) {
  const lower = command.toLowerCase()

  if (lower.includes("scan bron")) return await scanSource()
  if (lower.includes("classificeer bron")) return await classifySource()
  if (lower.includes("bouw remap plan")) return await buildRemapPlan()

  if (lower.includes("activeer write mode")) {
    enableWriteMode()
    await sendTelegram("✍️ WRITE MODE geactiveerd")
    return
  }

  if (lower.includes("remap backend")) return await executeRemap("backend")
  if (lower.includes("remap frontend")) return await executeRemap("frontend")
  if (lower.includes("remap executor")) return await executeRemap("executor")

  await sendTelegram("⚠️ Onbekend commando: " + command)
}

/* =======================
   AGENT LOGIC
======================= */
async function scanSource() {
  const base = path.resolve("./AO_MASTER_FULL_DEPLOY_CLEAN")
  if (!fs.existsSync(base)) {
    await sendTelegram("❌ Bronmap ontbreekt")
    return
  }

  const files = []

  function walk(dir) {
    for (const item of fs.readdirSync(dir)) {
      const full = path.join(dir, item)
      const stat = fs.statSync(full)
      if (stat.isDirectory()) walk(full)
      else files.push(full.replace(base + "/", ""))
    }
  }

  walk(base)
  sourceScan = files

  await sendTelegram("📂 Bron gescand: " + files.length + " bestanden")
}

async function classifySource() {
  if (!sourceScan) {
    await sendTelegram("⚠️ Eerst scan bron uitvoeren")
    return
  }

  classifiedFiles = { backend: [], frontend: [], executor: [], unknown: [] }

  for (const f of sourceScan) {
    const l = f.toLowerCase()
    if (l.includes("backend") || l.includes("api") || l.includes("routes"))
      classifiedFiles.backend.push(f)
    else if (l.includes("frontend") || l.includes("pages") || l.includes("app"))
      classifiedFiles.frontend.push(f)
    else if (l.includes("executor") || l.includes("agent"))
      classifiedFiles.executor.push(f)
    else
      classifiedFiles.unknown.push(f)
  }

  await sendTelegram(
    "🧠 Classificatie klaar\n" +
    "Backend: " + classifiedFiles.backend.length + "\n" +
    "Frontend: " + classifiedFiles.frontend.length + "\n" +
    "Executor: " + classifiedFiles.executor.length
  )
}

async function buildRemapPlan() {
  if (!classifiedFiles) {
    await sendTelegram("⚠️ Geen classificatie beschikbaar")
    return
  }

  remapPlan = {
    backend: classifiedFiles.backend,
    frontend: classifiedFiles.frontend,
    executor: classifiedFiles.executor
  }

  await sendTelegram("🗺️ Remap plan opgebouwd")
}

async function executeRemap(target) {
  const files = remapPlan?.[target] || []
  if (!files.length) {
    await sendTelegram("⚠️ Geen bestanden voor " + target)
    return
  }

  await sendTelegram("🚧 REMAP gestart voor " + target)
  await runRemap(target, files)
}

/* =======================
   START
======================= */
app.listen(PORT, async () => {
  console.log("AO Executor draait op poort " + PORT)

  try {
    await sendTelegram("✅ AO Executor gestart en luistert naar Telegram")
    console.log("[AO] Telegram test verzonden")
  } catch (err) {
    console.error("[AO][TELEGRAM START FOUT]", err.message)
  }
})

import * as dotenv from "dotenv"
dotenv.config()

import express from "express"
import fetch from "node-fetch"
import { sendTelegram } from "./telegram/telegram.js"
import {
  runRemap,
  enableWriteMode,
  initRemapConfig
} from "./remap/remapEngine.js"
import { supabase } from "./lib/supabase.js"

/* =======================
APP
======================= */
const app = express()
app.use(express.json())

/* =======================
ENV VALIDATIE
======================= */
const REQUIRED_ENVS = [
  "SUPABASE_URL",
  "SUPABASE_SERVICE_ROLE_KEY",
  "TELEGRAM_BOT_TOKEN",
  "TELEGRAM_CHAT_ID"
]

for (const key of REQUIRED_ENVS) {
  if (!process.env[key]) {
    console.error("[AO][ENV FOUT] ontbreekt:", key)
  }
}

/* =======================
CONFIG
======================= */
const PORT = process.env.PORT || 10000

const EXECUTORS = {
  calculation: process.env.AO_CALCULATION_URL,
  projects: process.env.AO_PROJECTS_URL,
  documents: process.env.AO_DOCUMENTS_URL,
  engineering: process.env.AO_ENGINEERING_URL,
  bim: process.env.AO_BIM_URL
}

initRemapConfig()

/* =======================
STATE
======================= */
let sourceScan = []
let classifiedFiles = null
let remapPlan = null
let pipelineRunning = false

/* =======================
ROUTES
======================= */
app.get("/ping", (_, res) => {
  res.status(200).send("AO CORE OK")
})

/* ===== BUSINESS ACTION ROUTER ===== */
app.post("/action", async (req, res) => {
  const { target, payload } = req.body

  if (!EXECUTORS[target]) {
    return res.status(400).json({
      ok: false,
      error: "Onbekende executor: " + target
    })
  }

  try {
    const r = await fetch(EXECUTORS[target] + "/execute", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    })

    const data = await r.json()
    res.json(data)
  } catch (err) {
    res.status(500).json({
      ok: false,
      error: err.message
    })
  }
})

/* ===== TELEGRAM CONTROL ===== */
app.post("/telegram/webhook", async (req, res) => {
  const message = req.body?.message?.text
  if (!message) return res.sendStatus(200)

  const cmd = message.toLowerCase().trim().replace(/\s+/g, " ")
  console.log("[AO][TELEGRAM]", cmd)

  try {
    await sendTelegram("📥 Command: " + cmd)
    await handleCommand(cmd)
  } catch (err) {
    await sendTelegram("❌ Fout: " + err.message)
    pipelineRunning = false
  }

  res.sendStatus(200)
})

/* =======================
COMMAND ROUTER (REMAP / BUILD)
======================= */
async function handleCommand(cmd) {
  if (pipelineRunning) {
    await sendTelegram("⛔ Pipeline draait al")
    return
  }

  if (cmd === "scan bron") return scanSource()
  if (cmd === "classificeer bron") return classifySource()
  if (cmd === "bouw remap plan") return buildRemapPlan()

  if (cmd === "remap backend") {
    enableWriteMode()
    return executeRemap("backend")
  }

  if (cmd === "remap frontend") {
    enableWriteMode()
    return executeRemap("frontend")
  }

  if (cmd === "remap executor") {
    enableWriteMode()
    return executeRemap("executor")
  }

  if (cmd === "remap alles") {
    pipelineRunning = true
    enableWriteMode()
    await buildRemapPlan()
    await executeRemap("backend")
    await executeRemap("frontend")
    await executeRemap("executor")
    pipelineRunning = false
    return
  }

  await sendTelegram("⚠️ Onbekend commando")
}

/* =======================
SCAN
======================= */
async function scanSource() {
  sourceScan = await runRemap("scan")

  await supabase.from("ao_repo_scan").insert({
    repo: "executor",
    branch: "main",
    files: sourceScan
  })

  await sendTelegram("📂 Scan klaar: " + sourceScan.length)
}

/* =======================
CLASSIFICATIE
======================= */
async function classifySource() {
  if (!sourceScan.length) {
    await sendTelegram("⛔ Geen scan beschikbaar")
    return
  }

  classifiedFiles = {
    backend: [],
    frontend: [],
    executor: [],
    unknown: []
  }

  for (const f of sourceScan) {
    const l = f.toLowerCase()
    if (l.includes("/api/")) classifiedFiles.backend.push(f)
    else if (l.includes("/pages/")) classifiedFiles.frontend.push(f)
    else if (l.includes("ao.js")) classifiedFiles.executor.push(f)
    else classifiedFiles.unknown.push(f)
  }

  await sendTelegram(
    "🧠 Classificatie\n" +
    "Backend: " + classifiedFiles.backend.length + "\n" +
    "Frontend: " + classifiedFiles.frontend.length + "\n" +
    "Executor: " + classifiedFiles.executor.length
  )
}

/* =======================
REMAP
======================= */
async function buildRemapPlan() {
  if (!classifiedFiles) {
    await sendTelegram("⛔ Eerst classificeren")
    return
  }
  remapPlan = classifiedFiles
  await sendTelegram("🗺️ Remap plan klaar")
}

async function executeRemap(target) {
  const files = remapPlan?.[target] || []
  if (!files.length) {
    await sendTelegram("⚠️ Geen bestanden voor " + target)
    return
  }

  await sendTelegram("🚧 REMAP " + target)
  await runRemap(target, files)
  await sendTelegram("✅ REMAP " + target + " afgerond")
}

/* =======================
START
======================= */
app.listen(PORT, async () => {
  console.log("AO CORE draait op poort " + PORT)
  await sendTelegram("✅ AO CORE live")
})

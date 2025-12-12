import * as dotenv from "dotenv"
dotenv.config()

import express from "express"
import axios from "axios"
import { sendTelegram } from "./telegram/telegram.js"
import { runRemap, enableWriteMode, initRemapConfig } from "./remap/remapEngine.js"

const app = express()
app.use(express.json())

/* =======================
   ENV VALIDATIE
======================= */
const REQUIRED_ENVS = [
  "TELEGRAM_BOT_TOKEN",
  "TELEGRAM_CHAT_ID",
  "GITHUB_PAT",
  "GITHUB_REPO"
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

/* init remap config 1x */
initRemapConfig()

/* =======================
   STATE
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

app.post("/telegram/webhook", async (req, res) => {
  const message = req.body?.message?.text
  if (!message) return res.sendStatus(200)

  console.log("[AO] Telegram:", message)
  await sendTelegram("📥 Ontvangen: " + message)
  await handleCommand(message)

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
   LOGIC
======================= */
async function scanSource() {
  const files = await runRemap("scan")
  sourceScan = files
  await sendTelegram("📂 Scan klaar: " + files.length + " bestanden")
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
    "🧠 Classificatie\n" +
    "Backend: " + classifiedFiles.backend.length + "\n" +
    "Frontend: " + classifiedFiles.frontend.length + "\n" +
    "Executor: " + classifiedFiles.executor.length
  )
}

async function buildRemapPlan() {
  if (!classifiedFiles) {
    await sendTelegram("⚠️ Geen classificatie")
    return
  }

  remapPlan = classifiedFiles
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
  await sendTelegram("✅ AO Executor live")
})

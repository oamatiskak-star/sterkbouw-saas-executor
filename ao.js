import * as dotenv from "dotenv"
dotenv.config()

import express from "express"
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

/* init remap config exact 1x */
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

  console.log("[AO][TELEGRAM] ontvangen:", message)

  try {
    await sendTelegram("📥 Command ontvangen: " + message)
    await handleCommand(message)
  } catch (err) {
    console.error("[AO][TELEGRAM COMMAND FOUT]", err.message)
    await sendTelegram("❌ Fout: " + err.message)
  }

  res.sendStatus(200)
})

/* =======================
COMMAND ROUTER
======================= */
async function handleCommand(command) {
  const clean = command
    .toLowerCase()
    .trim()
    .replace(/\s+/g, " ")

  console.log("[AO][CMD]", clean)

  if (clean === "activeer write mode") {
    enableWriteMode()
    console.log("[AO][WRITE MODE] AAN")
    await sendTelegram("✍️ WRITE MODE STAAT AAN")
    return
  }

  if (clean === "scan bron") {
    console.log("[AO][ACTIE] scan bron")
    return await scanSource()
  }

  if (clean === "classificeer bron") {
    console.log("[AO][ACTIE] classificeer bron")
    return await classifySource()
  }

  if (clean === "bouw remap plan") {
    console.log("[AO][ACTIE] bouw remap plan")
    return await buildRemapPlan()
  }

  if (clean === "remap backend") {
    console.log("[AO][ACTIE] remap backend")
    return await executeRemap("backend")
  }

  if (clean === "remap frontend") {
    console.log("[AO][ACTIE] remap frontend")
    return await executeRemap("frontend")
  }

  if (clean === "remap executor") {
    console.log("[AO][ACTIE] remap executor")
    return await executeRemap("executor")
  }

  await sendTelegram("⚠️ Onbekend commando: " + clean)
}

/* =======================
LOGIC
======================= */
async function scanSource() {
  console.log("[AO][SCAN] gestart")

  const files = await runRemap("scan")
  sourceScan = files

  console.log("[AO][SCAN] klaar:", files.length)
  await sendTelegram("📂 Scan klaar: " + files.length + " bestanden")
}

async function classifySource() {
  if (!sourceScan) {
    await sendTelegram("⚠️ Eerst scan bron uitvoeren")
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

  remapPlan = classifiedFiles
  await sendTelegram("🗺️ Remap plan opgebouwd")
}

async function executeRemap(target) {
  const files = remapPlan?.[target] || []

  if (!files.length) {
    await sendTelegram("⚠️ Geen bestanden voor " + target)
    return
  }

  console.log("[AO][REMAP] start", target, files.length)
  await sendTelegram("🚧 REMAP gestart voor " + target)

  await runRemap(target, files)

  await sendTelegram("✅ REMAP afgerond voor " + target)
}

/* =======================
START
======================= */
app.listen(PORT, async () => {
  console.log("AO Executor draait op poort " + PORT)
  await sendTelegram("✅ AO Executor live en gereed")
})

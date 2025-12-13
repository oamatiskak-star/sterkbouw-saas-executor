import * as dotenv from "dotenv"
dotenv.config()

import express from "express"
import { sendTelegram } from "./telegram/telegram.js"
import {
  runRemap,
  enableWriteMode,
  initRemapConfig
} from "./remap/remapEngine.js"

/* =======================
APP
======================= */
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

  const clean = message.toLowerCase().trim().replace(/\s+/g, " ")

  console.log("[AO][TELEGRAM] ontvangen:", clean)

  try {
    await sendTelegram("📥 Command ontvangen: " + clean)
    await handleCommand(clean)
  } catch (err) {
    console.error("[AO][COMMAND FOUT]", err.message)
    await sendTelegram("❌ Fout: " + err.message)
  }

  res.sendStatus(200)
})

/* =======================
COMMAND ROUTER
======================= */
async function handleCommand(cmd) {
  console.log("[AO][CMD]", cmd)

  if (cmd === "activeer write mode") {
    enableWriteMode()
    await sendTelegram("✍️ WRITE MODE STAAT AAN")
    return
  }

  if (cmd === "scan bron") return await scanSource()
  if (cmd === "classificeer bron") return await classifySource()
  if (cmd === "bouw remap plan") return await buildRemapPlan()

  if (cmd.startsWith("remap") && cmd.includes("backend")) {
    await executeRemap("backend")
    await runBuild()
    return
  }

  if (cmd.startsWith("remap") && (cmd.includes("frontend") || cmd.includes("front"))) {
    await executeRemap("frontend")
    await runBuild()
    return
  }

  if (cmd.startsWith("remap") && (cmd.includes("executor") || cmd.includes("exec"))) {
    await executeRemap("executor")
    await runBuild()
    return
  }

  await sendTelegram("⚠️ Onbekend commando: " + cmd)
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
  if (!Array.isArray(sourceScan) || sourceScan.length === 0) {
    await sendTelegram("⛔ Eerst scan bron uitvoeren")
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
    "Executor: " + classifiedFiles.executor.length + "\n" +
    "Overig: " + classifiedFiles.unknown.length
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
  enableWriteMode()
  console.log("[AO][REMAP] WRITE MODE GEFORCEERD")

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
BUILD (AUTOMATISCH NA REMAP)
======================= */
async function runBuild() {
  console.log("[AO][BUILD] gestart")
  await sendTelegram("🏗️ Build gestart")

  // hier koppel je later Render / Vercel hooks

  await sendTelegram("✅ Build afgerond")
  console.log("[AO][BUILD] afgerond")
}

/* =======================
START
======================= */
app.listen(PORT, async () => {
  console.log("AO Executor draait op poort " + PORT)
  await sendTelegram("✅ AO Executor live en gereed")
})

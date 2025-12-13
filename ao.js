import * as dotenv from "dotenv"
dotenv.config()

import express from "express"
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
  "TELEGRAM_BOT_TOKEN",
  "TELEGRAM_CHAT_ID",
  "GITHUB_PAT",
  "GITHUB_REPO",
  "SUPABASE_URL",
  "SUPABASE_SERVICE_ROLE_KEY"
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
const REPO = process.env.GITHUB_REPO
const BRANCH = process.env.GITHUB_BRANCH || "main"

initRemapConfig()

/* =======================
STATE
======================= */
let sourceScan = null
let classifiedFiles = null
let remapPlan = null
let pipelineRunning = false

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
    pipelineRunning = false
  }

  res.sendStatus(200)
})

/* =======================
COMMAND ROUTER
======================= */
async function handleCommand(cmd) {
  console.log("[AO][CMD]", cmd)

  if (pipelineRunning) {
    await sendTelegram("⛔ Pipeline draait al. Wacht tot deze klaar is.")
    return
  }

  if (
    cmd === "build alles" ||
    cmd === "bouw alles" ||
    cmd === "start build" ||
    cmd === "volledige build"
  ) {
    pipelineRunning = true
    return await runFullPipeline()
  }

  await sendTelegram("⚠️ Onbekend commando: " + cmd)
}

/* =======================
VOLLEDIGE PIPELINE
======================= */
async function runFullPipeline() {
  await sendTelegram("🚀 Volledige SterkBouw build gestart")

  try {
    enableWriteMode()
    await sendTelegram("✍️ WRITE MODE geactiveerd")

    const hasScan = await loadScanIfExists()
    if (!hasScan) {
      await scanSource()
    } else {
      await sendTelegram("♻️ Bestaande scan hergebruikt")
    }

    await classifySource()
    await buildRemapPlan()

    await executeRemap("backend")
    await executeRemap("frontend")
    await executeRemap("executor")

    await runBuild()

    await sendTelegram("✅ Volledige build afgerond")
  } catch (err) {
    console.error("[AO][PIPELINE FOUT]", err.message)

    if (err.message.includes("403")) {
      await sendTelegram(
        "⛔ GitHub 403 bij scan.\n" +
        "Gebruik een CLASSIC GitHub token met scopes:\n" +
        "- repo\n" +
        "- read:org\n" +
        "Daarna Render redeploy met cache clear."
      )
    } else {
      await sendTelegram("❌ Pipeline gestopt: " + err.message)
    }
  } finally {
    pipelineRunning = false
  }
}

/* =======================
SCAN LOGIC
======================= */
async function loadScanIfExists() {
  const { data } = await supabase
    .from("ao_repo_scan")
    .select("files")
    .eq("repo", REPO)
    .eq("branch", BRANCH)
    .order("created_at", { ascending: false })
    .limit(1)
    .single()

  if (data?.files) {
    sourceScan = data.files
    return true
  }

  return false
}

async function scanSource() {
  console.log("[AO][SCAN] gestart")

  const files = await runRemap("scan")
  sourceScan = files

  await supabase
    .from("ao_repo_scan")
    .insert({
      repo: REPO,
      branch: BRANCH,
      files
    })

  console.log("[AO][SCAN] klaar:", files.length)
  await sendTelegram("📂 Scan klaar en opgeslagen: " + files.length)
}

/* =======================
CLASSIFICATIE
======================= */
async function classifySource() {
  if (!Array.isArray(sourceScan) || sourceScan.length === 0) {
    throw new Error("Geen scan beschikbaar")
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

/* =======================
REMAP
======================= */
async function buildRemapPlan() {
  remapPlan = classifiedFiles
  await sendTelegram("🗺️ Remap plan opgebouwd")
}

async function executeRemap(target) {
  enableWriteMode()

  const files = remapPlan?.[target] || []
  if (!files.length) {
    await sendTelegram("⚠️ Geen bestanden voor " + target)
    return
  }

  await sendTelegram("🚧 REMAP gestart voor " + target)
  await runRemap(target, files)
  await sendTelegram("✅ REMAP afgerond voor " + target)
}

/* =======================
BUILD
======================= */
async function runBuild() {
  await sendTelegram("🏗️ Build gestart")
  await sendTelegram("✅ Build afgerond")
}

/* =======================
START
======================= */
app.listen(PORT, async () => {
  console.log("AO Executor draait op poort " + PORT)
  await sendTelegram("✅ AO Executor live en gereed")
})

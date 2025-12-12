import * as dotenv from "dotenv"
dotenv.config()

import express from "express"
import axios from "axios"
import { sendTelegram } from "./telegram/telegram.js"
import { createClient } from "@supabase/supabase-js"
import fs from "fs"
import path from "path"
import { runRemap } from "./remap/remapEngine.js"

const app = express()
app.use(express.json())

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
  await sendTelegram("[AO] Webhook ontvangen: " + commitMessage)
  await handleCommand(commitMessage)
  res.status(200).send("Webhook OK")
})

/* =======================
   COMMAND ROUTER
======================= */
async function handleCommand(command) {
  const lower = command.toLowerCase()

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

  await sendTelegram("⚠️ Onbekend commando ontvangen:\n" + command)
}

/* =======================
   EXISTING FUNCTIONS
======================= */
async function vercelRateLimitCheck() {
  const now = Date.now()
  const verschil = (now - lastFrontendDeploy) / 1000
  if (verschil < 60) {
    await sendTelegram("🛑 Deploy geblokkeerd: minder dan 60 sec sinds laatste poging.")
    return false
  }
  lastFrontendDeploy = now
  return true
}

async function pingURL(label, url) {
  if (!url) return
  try {
    const r = await axios.get(url + "/ping")
    console.log(`[AO] ${label} OK: ${r.status}`)
  } catch (e) {
    console.log(`[AO] ${label} FOUT: ${e.message}`)
  }
}

async function importTasks() {
  const sourcePath = path.resolve("./AO_MASTER_FULL_DEPLOY_CLEAN")
  if (!fs.existsSync(sourcePath)) {
    await sendTelegram("❌ AO_MASTER_FULL_DEPLOY_CLEAN map niet gevonden")
    return
  }
  await sendTelegram("✅ Bronmap gevonden")
}

async function importSupabase() {
  try {
    const { data, error } = await supabase.from("pg_tables").select("*")
    if (error) throw error
    await sendTelegram(`✅ Supabase tabellen: ${data.length}`)
  } catch (err) {
    await sendTelegram("⚠️ Supabase fout: " + err.message)
  }
}

async function koppelNieuweModules(target) {
  await sendTelegram(`🔗 Modules gekoppeld aan ${target}`)
}

/* =======================
   AGENT IMPLEMENTATIE
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

  await sendTelegram(`📂 Bron gescand: ${files.length} bestanden`)
}

async function classifySource() {
  if (!sourceScan) {
    await sendTelegram("⚠️ Eerst 'scan bron' uitvoeren")
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
    else if (l.includes("frontend") || l.includes("app") || l.includes("pages"))
      classifiedFiles.frontend.push(f)
    else if (l.includes("executor") || l.includes("agent") || l.includes("workflow"))
      classifiedFiles.executor.push(f)
    else
      classifiedFiles.unknown.push(f)
  }

  await sendTelegram(
    `🧠 Classificatie klaar\n` +
    `Backend: ${classifiedFiles.backend.length}\n` +
    `Frontend: ${classifiedFiles.frontend.length}\n` +
    `Executor: ${classifiedFiles.executor.length}\n` +
    `Onbekend: ${classifiedFiles.unknown.length}`
  )
}

async function buildRemapPlan() {
  if (!classifiedFiles) {
    await sendTelegram("⚠️ Eerst 'classificeer bron' uitvoeren")
    return
  }

  remapPlan = {
    backend: classifiedFiles.backend,
    frontend: classifiedFiles.frontend,
    executor: classifiedFiles.executor
  }

  await sendTelegram("🗺️ Remap-plan opgebouwd")
}

async function executeRemap(target) {
  if (!remapPlan) {
    await sendTelegram("⚠️ Geen remap-plan beschikbaar")
    return
  }

  const files = remapPlan[target] || []
  if (!files.length) {
    await sendTelegram("⚠️ Geen bestanden voor " + target)
    return
  }

  await sendTelegram(`🧪 DRY-RUN gestart voor ${target}`)
  await runRemap(target, files, "dry")
}

/* =======================
   AUTO START
======================= */
function startAutoPing() {
  setInterval(async () => {
    await pingURL("Backend", BACKEND_URL)
    await pingURL("Frontend", FRONTEND_URL)
    await pingURL("Executor", EXECUTOR_URL)
    await pingURL("Vercel", VERCEL_URL)
  }, 2 * 60 * 1000)
}

app.listen(PORT, async () => {
  console.log("AO Executor draait op poort " + PORT)
  await sendTelegram("[AO] Executor gestart")
  startAutoPing()
})

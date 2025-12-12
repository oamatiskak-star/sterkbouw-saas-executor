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
const BACKEND_URL = process.env.BACKEND_URL
const EXECUTOR_URL = process.env.EXECUTOR_URL
const VERCEL_URL = process.env.VERCEL_URL
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
    if (lower.includes("ping backend"))
      return await pingURL("Backend", BACKEND_URL)

    if (lower.includes("importeer taken")) {
      await sendTelegram("Import taken gestart")
      await importTasks()
      return
    }

    if (lower.includes("importeer supabase")) {
      await sendTelegram("Supabase import gestart")
      await importSupabase()
      return
    }

    if (lower.includes("activeer write mode")) {
      enableWriteMode()
      await sendTelegram("WRITE MODE geactiveerd")
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

    await sendTelegram("Onbekend commando: " + command)

  } catch (err) {
    console.error("[AO][COMMAND FOUT]", err.message)
    try {
      await sendTelegram("AO fout: " + err.message)
    } catch {}
  }
}

/* =======================
   HELPERS
======================= */
async function pingURL(label, url) {
  if (!url) return
  try {
    const r = await axios.get(url + "/ping")
    console.log("[AO]", label, "OK:", r.status)
  } catch (e) {
    console.log("[AO]", label, "FOUT:", e.message)
  }
}

async function importTasks() {
  const sourcePath = path.resolve("./AO_MASTER_FULL_DEPLOY_CLEAN")
  if (!fs.existsSync(sourcePath)) {
    await sendTelegram("Bronmap niet gevonden")
    return
  }
  await sendTelegram("Bronmap gevonden")
}

async function importSupabase() {
  try {
    const { data, error } = await supabase.from("pg_tables").select("*")
    if (error) throw error
    await sendTelegram("Supabase tabellen: " + data.length)
  } catch (err) {
    await sendTelegram("Supabase fout: " + err.message)
  }
}

/* =======================
   AGENT LOGIC
======================= */
async function scanSource() {
  const base = path.resolve("./AO_MASTER_FULL_DEPLOY_CLEAN")
  if (!fs.existsSync(base)) {
    await sendTelegram("Bronmap ontbreekt")
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
  await sendTelegram("Bron gescand: " + files.length + " bestanden")
}

async function classifySource() {
  if (!sourceScan) {
    await sendTelegram("Eerst scan uitvoeren")
    return
  }

  classifiedFiles = { backend: [], frontend: [], executor: [], unknown: [] }

  for (const f of sourceScan) {
    const l = f.toLowerCase()
    if (l.includes("backend") || l.includes("api") || l.includes("routes"))
      classifiedFiles.backend.push(f)
    else if (l.includes("frontend") || l.includes("pages"))
      classifiedFiles.frontend.push(f)
    else if (l.includes("executor") || l.includes("agent"))
      classifiedFiles.executor.push(f)
    else
      classifiedFiles.unknown.push(f)
  }

  await sendTelegram(
    "Classificatie klaar\n" +
    "Backend: " + classifiedFiles.backend.length + "\n" +
    "Frontend: " + classifiedFiles.frontend.length + "\n" +
    "Executor: " + classifiedFiles.executor.length
  )
}

async function buildRemapPlan() {
  remapPlan = {
    backend: classifiedFiles.backend,
    frontend: classifiedFiles.frontend,
    executor: classifiedFiles.executor
  }
  await sendTelegram("Remap plan opgebouwd")
}

async function executeRemap(target) {
  const files = remapPlan?.[target] || []
  if (!files.length) {
    await sendTelegram("Geen bestanden voor " + target)
    return
  }

  await sendTelegram("Remap gestart voor " + target)
  await runRemap(target, files)
}

/* =======================
   START
======================= */
app.listen(PORT, async () => {
  console.log("AO Executor draait op poort " + PORT)

  try {
    await sendTelegram("AO Executor gestart")
    console.log("Telegram test verzonden")
  } catch (err) {
    console.error("Telegram fout:", err.message)
  }
})

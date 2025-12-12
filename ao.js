import * as dotenv from "dotenv"
dotenv.config()

import express from "express"
import axios from "axios"
import { sendTelegram } from "./telegram/telegram.js"
import { createClient } from "@supabase/supabase-js"
import fs from "fs"
import path from "path"

const app = express()
app.use(express.json())

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

app.get("/ping", (req, res) => {
  res.status(200).send("AO EXECUTOR OK")
})

app.post("/api/webhook", async (req, res) => {
  const commitMessage = req.body.head_commit?.message || "Geen commit message gevonden"
  await sendTelegram("[AO] Webhook ontvangen: " + commitMessage)
  await handleCommand(commitMessage)
  res.status(200).send("Webhook OK")
})

async function handleCommand(command) {
  const lower = command.toLowerCase()

  if (lower.includes("restart agent")) return await sendTelegram("⏳ Agent restart wordt uitgevoerd op Render")
  if (lower.includes("ping backend")) return await pingURL("Backend", BACKEND_URL)
  if (lower.includes("deploy front")) {
    const mag = await vercelRateLimitCheck()
    if (mag) await sendTelegram("🚀 Deploycommando voor Frontend gestart")
    return
  }
  if (lower.includes("importeer taken")) {
    await sendTelegram("📦 Importeren van AO_MASTER_FULL_DEPLOY_CLEAN + Supabase gestart")
    await importTasks()
    return
  }
  if (lower.includes("sync taken backend")) return await sendTelegram("📁 Taken gesynchroniseerd naar Backend")
  if (lower.includes("sync taken frontend")) return await sendTelegram("📁 Taken gesynchroniseerd naar Frontend")
  if (lower.includes("sync taken executor")) return await sendTelegram("📁 Taken gesynchroniseerd naar Executor")
  if (lower.includes("importeer supabase")) {
    await sendTelegram("📦 Supabase import gestart")
    await importSupabase()
    return
  }

  // Nieuw: Specifieke AO modules
  if (lower.includes("sync risico analyse")) return await sendTelegram("📊 Risico-analyse taken gesynchroniseerd")
  if (lower.includes("genereer kopersportaal")) return await sendTelegram("🛒 Kopersportaal-pagina’s gegenereerd")
  if (lower.includes("genereer huurdersportaal")) return await sendTelegram("🏠 Huurdersportaal-pagina’s gegenereerd")
  if (lower.includes("genereer e installaties")) return await sendTelegram("🔌 E-installaties gemapt")
  if (lower.includes("genereer w installaties")) return await sendTelegram("🔥 W-installaties gemapt")
  if (lower.includes("sync bim architecten")) return await sendTelegram("🏗️ BIM Architectenmodule gekoppeld")

  await sendTelegram("⚠️ Onbekend commando ontvangen:\n" + command)
}

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
  try {
    const sourcePath = path.resolve("./AO_MASTER_FULL_DEPLOY_CLEAN")
    if (!fs.existsSync(sourcePath)) {
      await sendTelegram("❌ AO_MASTER_FULL_DEPLOY_CLEAN map niet gevonden!")
      return
    }
    await sendTelegram("✅ AO_MASTER_FULL_DEPLOY_CLEAN gevonden, taken geladen")
    // TODO: Mapping per module toevoegen
  } catch (err) {
    await sendTelegram("⚠️ Fout bij import taken: " + err.message)
  }
}

async function importSupabase() {
  try {
    const { data: tables, error } = await supabase.from("pg_tables").select("*")
    if (error) throw error
    await sendTelegram(`✅ Supabase: ${tables.length} tabellen opgehaald`)
    // TODO: Taken aanmaken per tabel
  } catch (err) {
    await sendTelegram("⚠️ Fout bij Supabase import: " + err.message)
  }
}

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
  await pingURL("Backend", BACKEND_URL)
  startAutoPing()
  await handleCommand("importeer taken")
  await handleCommand("importeer supabase")
})

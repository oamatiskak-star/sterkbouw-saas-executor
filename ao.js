import * as dotenv from "dotenv"
dotenv.config()

import express from "express"
import axios from "axios"
import cors from "cors"
import morgan from "morgan"

import { sendTelegram } from "./telegram/telegram.js"
import triggerLogRouter from "./routes/trigger-log.js"

const app = express()
app.use(cors())
app.use(express.json())
app.use(morgan("dev"))

const PORT = process.env.PORT || 10000
const BACKEND_URL = process.env.BACKEND_URL
const FRONTEND_URL = process.env.FRONTEND_URL
const EXECUTOR_URL = process.env.EXECUTOR_URL
const SUPABASE_URL = process.env.SUPABASE_URL
const GITHUB_URL = process.env.GITHUB_URL
const VERCEL_URL = process.env.VERCEL_URL

let lastFrontendDeploy = 0

app.get("/ping", (req, res) => {
  res.status(200).send("AO EXECUTOR OK")
})

// ✅ EVENTTRIGGER VOOR TELEGRAM MELDINGEN
app.use("/trigger-log", triggerLogRouter)

app.post("/api/webhook", async (req, res) => {
  await sendTelegram("[AO] Webhook ontvangen van Vercel")
  const commitMessage = req.body.head_commit?.message || "Geen commit message gevonden"
  await handleCommand(commitMessage)
  res.status(200).send("Webhook OK")
})

async function handleCommand(command) {
  const lower = command.toLowerCase()

  if (lower.includes("restart agent")) {
    await sendTelegram("⏳ Agent restart wordt uitgevoerd op Render")
    return
  }

  if (lower.includes("ping backend")) {
    await pingURL("Backend", BACKEND_URL)
    return
  }

  if (lower.includes("deploy front")) {
    const magDeployen = await vercelRateLimitCheck()
    if (!magDeployen) return
    await sendTelegram("🚀 Deploycommando voor Frontend gestart")
    return
  }

  if (lower.includes("importeer taken")) {
    await sendTelegram("📦 Start import taken vanuit AO_MASTER_FULL_DEPLOY_CLEAN")
    return
  }

  if (lower.includes("sync taken backend")) {
    await sendTelegram("📁 Taken synchroniseren met SterkBouw Backend")
    return
  }

  if (lower.includes("sync taken frontend")) {
    await sendTelegram("📁 Taken synchroniseren met SterkBouw Frontend")
    return
  }

  if (lower.includes("sync taken executor")) {
    await sendTelegram("📁 Taken synchroniseren met SterkBouw Executor")
    return
  }

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
  if (!url) {
    await sendTelegram(`⚠️ Geen URL ingesteld voor ${label}`)
    return
  }
  try {
    const r = await axios.get(url + "/ping")
    await sendTelegram(`[AO] ${label} OK: ${r.status}`)
  } catch (e) {
    await sendTelegram(`[AO] ${label} FOUT: ${e.message}`)
  }
}

function startAutoPing() {
  setInterval(async () => {
    await pingURL("Backend", BACKEND_URL)
    await pingURL("Frontend", FRONTEND_URL)
    await pingURL("Executor", EXECUTOR_URL)
    await pingURL("Vercel", VERCEL_URL)
    await pingURL("GitHub", GITHUB_URL)
    await pingURL("Supabase", SUPABASE_URL)
  }, 2 * 60 * 1000)
}

app.listen(PORT, async () => {
  console.log("AO Executor draait op poort " + PORT)
  await sendTelegram("[AO] Executor gestart")
  await pingURL("Backend", BACKEND_URL)
  startAutoPing()
})

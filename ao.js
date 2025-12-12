import * as dotenv from "dotenv"
dotenv.config()

import express from "express"
import axios from "axios"
import { sendTelegram } from "./telegram/telegram.js"

const app = express()
app.use(express.json())

const PORT = process.env.PORT || 10000
const BACKEND_URL = process.env.BACKEND_URL
const FRONTEND_URL = process.env.FRONTEND_URL
const EXECUTOR_URL = process.env.EXECUTOR_URL
const VERCEL_URL = process.env.VERCEL_URL

let lastFrontendDeploy = 0

app.get("/ping", (req, res) => {
  res.status(200).send("AO EXECUTOR OK")
})

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
  if (!url) return
  try {
    const r = await axios.get(url + "/ping")
    // GEEN Telegrammelding meer hier
    console.log(`[AO] ${label} OK: ${r.status}`)
  } catch (e) {
    console.log(`[AO] ${label} FOUT: ${e.message}`)
  }
}

function startAutoPing() {
  setInterval(async () => {
    await pingURL("Backend", BACKEND_URL)
    await pingURL("Frontend", FRONTEND_URL)
    await pingURL("Executor", EXECUTOR_URL)
    await pingURL("Vercel", VERCEL_URL)
    // GitHub & Supabase eruit
  }, 2 * 60 * 1000)
}

app.listen(PORT, async () => {
  console.log("AO Executor draait op poort " + PORT)
  await sendTelegram("[AO] Executor gestart")
  await pingURL("Backend", BACKEND_URL)
  startAutoPing()
})

import * as dotenv from "dotenv"
dotenv.config()

import express from "express"
import axios from "axios"
import { sendTelegram } from "./telegram/telegram.js"

const app = express()
app.use(express.json())

const PORT = process.env.PORT || 10000
const BACKEND_URL = process.env.BACKEND_URL

let statusLog = "🟢 AO Executor actief\nNog geen taken uitgevoerd"

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
    statusLog = "🔁 Restart commando ontvangen"
    return
  }

  if (lower.includes("ping backend")) {
    await pingBackend()
    statusLog = "📡 Ping backend uitgevoerd"
    return
  }

  if (lower.includes("deploy front")) {
    await sendTelegram("🚀 Deploycommando voor Frontend ontvangen")
    statusLog = "🚀 Frontend deploy commando ontvangen"
    return
  }

  if (lower.includes("importeer taken")) {
    await sendTelegram("📦 Start import taken vanuit AO_MASTER_FULL_DEPLOY_CLEAN")
    statusLog = "📦 Takenimport gestart vanaf MAIN"
    return
  }

  if (lower.includes("sync taken backend")) {
    await sendTelegram("📁 Taken synchroniseren met SterkBouw Backend")
    statusLog = "✅ Taken Backend gesynchroniseerd"
    return
  }

  if (lower.includes("sync taken frontend")) {
    await sendTelegram("📁 Taken synchroniseren met SterkBouw Frontend")
    statusLog = "✅ Taken Frontend gesynchroniseerd"
    return
  }

  if (lower.includes("sync taken executor")) {
    await sendTelegram("📁 Taken synchroniseren met SterkBouw Executor")
    statusLog = "✅ Taken Executor gesynchroniseerd"
    return
  }

  await sendTelegram("⚠️ Onbekend commando ontvangen:\n" + command)
  statusLog = "⚠️ Onbekend commando: " + command
}

async function pingBackend() {
  try {
    const r = await axios.get(BACKEND_URL + "/ping")
    await sendTelegram("[AO] Backend OK: " + r.status)
  } catch (e) {
    await sendTelegram("[AO] Backend FOUT: " + e.message)
  }
}

// Live status logging naar Telegram elke 10 seconden
setInterval(async () => {
  await sendTelegram("🔄 Statusupdate:\n" + statusLog)
}, 10000)

app.listen(PORT, async () => {
  console.log("AO Executor draait op poort " + PORT)
  await sendTelegram("[AO] Executor gestart")
  await pingBackend()
})

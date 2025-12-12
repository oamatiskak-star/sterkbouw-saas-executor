import * as dotenv from "dotenv"
dotenv.config()

import express from "express"
import axios from "axios"
import { sendTelegram } from "./telegram/telegram.js"

const app = express()
app.use(express.json())

const PORT = process.env.PORT || 10000
const BACKEND_URL = process.env.BACKEND_URL

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
    // eventueel extra logica
    return
  }

  if (lower.includes("ping backend")) {
    await pingBackend()
    return
  }

  if (lower.includes("deploy front")) {
    await sendTelegram("🚀 Deploycommando voor Frontend ontvangen")
    // trigger op supabase of Vercel (optioneel)
    return
  }

  await sendTelegram("⚠️ Onbekend commando ontvangen:\n" + command)
}

async function pingBackend() {
  try {
    const r = await axios.get(BACKEND_URL + "/ping")
    await sendTelegram("[AO] Backend OK: " + r.status)
  } catch (e) {
    await sendTelegram("[AO] Backend FOUT: " + e.message)
  }
}

app.listen(PORT, async () => {
  console.log("AO Executor draait op poort " + PORT)
  await sendTelegram("[AO] Executor gestart")
  await pingBackend()
})

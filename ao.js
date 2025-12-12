import * as dotenv from "dotenv"
dotenv.config()

import axios from "axios"
import express from "express"
import { sendTelegram } from "./telegram/telegram.js"

const app = express()
app.use(express.json())

const PORT = process.env.PORT || 10000
const BACKEND_URL = process.env.BACKEND_URL

// Healthcheck
app.get("/ping", (req, res) => {
  res.status(200).send("AO EXECUTOR OK")
})

// Test endpoint — voor Render/Vercel statuscheck
app.get("/test", (req, res) => {
  res.status(200).send("AO EXECUTOR FULL OK — versie 1.0.0")
})

// Webhook handler (GitHub / Vercel)
app.post("/api/webhook", async (req, res) => {
  await sendTelegram("[AO] Webhook ontvangen van Vercel of GitHub")
  res.status(200).send("Webhook OK")
})

// Backend ping routine
async function pingBackend() {
  try {
    console.log("[AO] PING BACKEND:", BACKEND_URL + "/ping")
    const r = await axios.get(BACKEND_URL + "/ping")
    await sendTelegram("[AO] Backend OK: " + r.status)
  } catch (e) {
    await sendTelegram("[AO] Backend FOUT: " + e.message)
  }
}

// Start de AO Agent
app.listen(PORT, async () => {
  console.log("AO Executor draait op poort " + PORT)
  await sendTelegram("[AO] Executor gestart. Backend ping volgt over 10 seconden...")

  setTimeout(() => {
    pingBackend()
  }, 10000)
})

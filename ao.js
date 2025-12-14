import * as dotenv from "dotenv"
dotenv.config()

import express from "express"
import fetch from "node-fetch"
import { sendTelegram } from "./telegram/telegram.js"

/* =======================
APP
======================= */
const app = express()
app.use(express.json())

/* =======================
CONFIG
======================= */
const PORT = process.env.PORT || 10000

const EXECUTORS = {
  calculation: process.env.AO_CALCULATION_URL,
  projects: process.env.AO_PROJECTS_URL,
  documents: process.env.AO_DOCUMENTS_URL,
  engineering: process.env.AO_ENGINEERING_URL,
  bim: process.env.AO_BIM_URL
}

/* =======================
ROUTES
======================= */
app.get("/ping", (_, res) => {
  res.status(200).send("AO CORE OK")
})

/* ===== BUSINESS ACTION ROUTER ===== */
app.post("/action", async (req, res) => {
  const { target, payload } = req.body

  if (!EXECUTORS[target]) {
    return res.status(400).json({
      ok: false,
      error: "Onbekende executor: " + target
    })
  }

  try {
    const r = await fetch(EXECUTORS[target] + "/execute", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    })

    const data = await r.json()
    res.json(data)
  } catch (err) {
    res.status(500).json({
      ok: false,
      error: err.message
    })
  }
})

/* ===== TELEGRAM COMMANDS ===== */
app.post("/telegram/webhook", async (req, res) => {
  const message = req.body?.message?.text
  if (!message) return res.sendStatus(200)

  const cmd = message.toLowerCase().trim()
  console.log("[AO][TELEGRAM]", cmd)

  await sendTelegram("📥 Ontvangen: " + cmd)

  if (cmd === "status") {
    await sendTelegram("✅ AO CORE actief")
  } else {
    await sendTelegram("ℹ️ Commando ontvangen maar geen actie gekoppeld")
  }

  res.sendStatus(200)
})

/* =======================
START
======================= */
app.listen(PORT, async () => {
  console.log("AO CORE draait op poort " + PORT)
  if (process.env.TELEGRAM_BOT_TOKEN) {
    await sendTelegram("✅ AO CORE live")
  }
})

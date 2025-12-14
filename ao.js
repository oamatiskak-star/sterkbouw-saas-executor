import * as dotenv from "dotenv"
dotenv.config()

import express from "express"
import fetch from "node-fetch"
import { createClient } from "@supabase/supabase-js"
import { v4 as uuid } from "uuid"
import { sendTelegram } from "./telegram/telegram.js"

const app = express()
app.use(express.json())

const PORT = process.env.PORT || 10000
const AO_ROLE = process.env.AO_ROLE || "core"

const supabase = process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY
  ? createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY)
  : null

const EXECUTORS = {
  calculation: process.env.AO_CALCULATION_URL,
  projects: process.env.AO_PROJECTS_URL,
  documents: process.env.AO_DOCUMENTS_URL,
  engineering: process.env.AO_ENGINEERING_URL,
  bim: process.env.AO_BIM_URL
}

/* =======================
PING
======================= */
app.get("/ping", (_, res) => {
  res.send(`AO OK (${AO_ROLE})`)
})

/* =======================
CORE ROUTER
======================= */
if (AO_ROLE === "core") {
  app.post("/action", async (req, res) => {
    const { target, payload } = req.body
    if (!EXECUTORS[target]) {
      return res.status(400).json({ ok: false, error: "Onbekende executor" })
    }
    try {
      const r = await fetch(EXECUTORS[target] + "/execute", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      })
      const data = await r.json()
      res.json(data)
    } catch (e) {
      res.status(500).json({ ok: false, error: e.message })
    }
  })

  app.post("/telegram/webhook", async (req, res) => {
    const text = req.body?.message?.text
    if (text) await sendTelegram("📥 " + text)
    res.sendStatus(200)
  })
}

/* =======================
CALCULATION
======================= */
if (AO_ROLE === "calculation") {
  app.post("/execute", async (req, res) => {
    try {
      const { projectId, type, input } = req.body
      if (!projectId) return res.status(400).json({ ok: false, error: "projectId ontbreekt" })

      if (type === "start") {
        const calculationId = uuid()
        await supabase.from("calculations").insert({
          id: calculationId,
          project_id: projectId,
          status: "running",
          result: null
        })
        return res.json({ ok: true, calculationId })
      }

      if (type === "run") {
        const { calculationId, m2, prijs_per_m2 } = input
        const bouwsom = Number(m2) * Number(prijs_per_m2)
        const result = { m2, prijs_per_m2, bouwsom }
        await supabase.from("calculations")
          .update({ status: "completed", result })
          .eq("id", calculationId)
        return res.json({ ok: true, result })
      }

      res.status(400).json({ ok: false, error: "Onbekend type" })
    } catch (e) {
      res.status(500).json({ ok: false, error: e.message })
    }
  })
}

/* =======================
PROJECTS
======================= */
if (AO_ROLE === "projects") {
  app.post("/execute", async (req, res) => {
    try {
      const { action, data } = req.body
      if (action === "create") {
        const id = uuid()
        await supabase.from("projects").insert({ id, ...data })
        return res.json({ ok: true, id })
      }
      res.status(400).json({ ok: false, error: "Onbekende actie" })
    } catch (e) {
      res.status(500).json({ ok: false, error: e.message })
    }
  })
}

/* =======================
DOCUMENTS
======================= */
if (AO_ROLE === "documents") {
  app.post("/execute", async (req, res) => {
    try {
      const { projectId, calculationId, file } = req.body
      const id = uuid()
      await supabase.from("uploads").insert({
        id,
        project_id: projectId,
        calculation_id: calculationId,
        file_name: file.name,
        file_url: file.url
      })
      res.json({ ok: true, id })
    } catch (e) {
      res.status(500).json({ ok: false, error: e.message })
    }
  })
}

/* =======================
ENGINEERING
======================= */
if (AO_ROLE === "engineering") {
  app.post("/execute", async (req, res) => {
    try {
      const { projectId, fases } = req.body
      const planning = fases.map((f, i) => ({
        fase: f,
        week_start: i * 2,
        week_einde: i * 2 + 2
      }))
      res.json({ ok: true, planning })
    } catch (e) {
      res.status(500).json({ ok: false, error: e.message })
    }
  })
}

/* =======================
BIM
======================= */
if (AO_ROLE === "bim") {
  app.post("/execute", async (req, res) => {
    try {
      const { ifcUrl } = req.body
      const hoeveelheden = [
        { type: "wand", m2: 320 },
        { type: "vloer", m2: 180 }
      ]
      res.json({ ok: true, hoeveelheden, bron: ifcUrl })
    } catch (e) {
      res.status(500).json({ ok: false, error: e.message })
    }
  })
}

/* =======================
START
======================= */
app.listen(PORT, async () => {
  console.log(`AO gestart (${AO_ROLE}) op poort ${PORT}`)
  if (process.env.TELEGRAM_BOT_TOKEN) {
    await sendTelegram(`✅ AO live (${AO_ROLE})`)
  }
})

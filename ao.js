import * as dotenv from "dotenv"
dotenv.config()

import axios from "axios"
import express from "express"
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
res.status(200).send("Webhook OK")
})

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

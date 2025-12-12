import express from "express"
import sendTelegram from "../telegram/telegram.js"

const router = express.Router()

router.post("/", async (req, res) => {
  const { type, title, message } = req.body

  try {
    await sendTelegram(`[🔔 ${type.toUpperCase()}]\n${title}\n${message}`)
    res.status(200).json({ ok: true })
  } catch (err) {
    res.status(500).json({ error: "Telegram failed", detail: err.message })
  }
})

export default router

import fetch from "node-fetch"

const TELEGRAM_API = "https://api.telegram.org"

/* =======================
SEND TELEGRAM MESSAGE
======================= */
export async function sendTelegram(text) {
  const token = process.env.TELEGRAM_BOT_TOKEN
  const chatId = process.env.TELEGRAM_CHAT_ID

  if (!token || !chatId) {
    console.error("[AO][TELEGRAM] ontbrekende token of chat id")
    return
  }

  try {
    await fetch(`${TELEGRAM_API}/bot${token}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: chatId,
        text
      })
    })
  } catch (err) {
    console.error("[AO][TELEGRAM] send fout:", err.message)
  }
}

/* =======================
INIT TELEGRAM WEBHOOK
======================= */
export default function initTelegram(app) {
  console.log("[AO][TELEGRAM] module geladen")

  app.post("/telegram/webhook", async (req, res) => {
    const message = req.body?.message?.text
    if (!message) return res.sendStatus(200)

    console.log("[AO][TELEGRAM] ontvangen:", message)
    res.sendStatus(200)
  })
}

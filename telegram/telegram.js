import fetch from "node-fetch"
import config from "../config.js"

// Named export zodat AO dit kan importeren
export async function sendTelegram(message) {
  const token = config.telegram.bot_token
  const chatId = config.telegram.chat_id

  if (!token || !chatId) {
    console.error("❌ Ontbrekende Telegram-configuratie in config.js")
    return
  }

  const url = `https://api.telegram.org/bot${token}/sendMessage`

  const body = {
    chat_id: chatId,
    text: message,
    parse_mode: "HTML"
  }

  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body)
    })

    const data = await res.json()
    if (!data.ok) console.error("⚠️ Telegram API error:", data)
  } catch (err) {
    console.error("⚠️ Fout bij verzenden Telegram-bericht:", err)
  }
}

import fetch from "node-fetch"

const BOT = process.env.TELEGRAM_BOT_TOKEN
const CHAT = process.env.TELEGRAM_CHAT_ID

export async function notify(agent, message) {
  if (!BOT || !CHAT) return

  await fetch(`https://api.telegram.org/bot${BOT}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      chat_id: CHAT,
      text: `[${agent}] ${message}`
    })
  })
}

import axios from "axios"

const TELEGRAM_TOKEN = process.env.TELEGRAM_BOT_TOKEN
const CHAT_ID = process.env.TELEGRAM_CHAT_ID

export async function sendTelegram(msg) {
  if (!TELEGRAM_TOKEN || !CHAT_ID) return
  const url = `https://api.telegram.org/bot${TELEGRAM_TOKEN}/sendMessage`
  await axios.post(url, {
    chat_id: CHAT_ID,
    text: msg,
  })
}

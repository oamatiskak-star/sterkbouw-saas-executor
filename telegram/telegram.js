import axios from 'axios'
import dotenv from 'dotenv'
dotenv.config()

const token = process.env.TELEGRAM_BOT_TOKEN
const chatId = process.env.TELEGRAM_CHAT_ID

export async function sendTelegram(message) {
  const url = `https://api.telegram.org/bot${token}/sendMessage`
  await axios.post(url, {
    chat_id: chatId,
    text: message
  })
}

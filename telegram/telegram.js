import axios from "axios"
import config from "../config.js"

export default async function sendTelegram(message) {
  const token = config.telegram.bot_token
  const chatId = config.telegram.chat_id

  await axios.post(`https://api.telegram.org/bot${token}/sendMessage`, {
    chat_id: chatId,
    text: message
  })
}

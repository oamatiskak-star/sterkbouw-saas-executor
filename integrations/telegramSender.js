import fetch from "node-fetch"

/*
====================================================
TELEGRAM SENDER – DEFINITIEF
- ÉÉN FUNCTIE
- GEBRUIKT VOOR CHAT + STATUS
- NOOIT CRASHEN
====================================================
*/

const TELEGRAM_API = "https://api.telegram.org"

export async function sendTelegram(chatId, text) {
  const token = process.env.TELEGRAM_BOT_TOKEN

  if (!token) {
    console.error("TELEGRAM_BOT_TOKEN ontbreekt")
    return
  }

  if (!chatId || !text) {
    console.error("TELEGRAM_SEND_INVALID_PAYLOAD", { chatId, text })
    return
  }

  try {
    await fetch(`${TELEGRAM_API}/bot${token}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: chatId,
        text: String(text),
        parse_mode: "Markdown",
        disable_web_page_preview: true
      })
    })
  } catch (err) {
    console.error("TELEGRAM_SEND_FAILED", err.message)
  }
}

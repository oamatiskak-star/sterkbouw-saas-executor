import fetch from "node-fetch"

/*
TELEGRAM NOTIFIER
– veilig
– geen crash bij fouten
– gebruikt bestaande env vars
*/

const TELEGRAM_TOKEN = process.env.TELEGRAM_BOT_TOKEN
const TELEGRAM_CHAT_ID = process.env.TELEGRAM_CHAT_ID

export async function sendTelegramMessage(text) {
  if (!TELEGRAM_TOKEN || !TELEGRAM_CHAT_ID) {
    console.warn("TELEGRAM ENV VARS ONTBREKEN")
    return
  }

  const url = `https://api.telegram.org/bot${TELEGRAM_TOKEN}/sendMessage`

  try {
    await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: TELEGRAM_CHAT_ID,
        text
      })
    })
  } catch (err) {
    console.error("TELEGRAM SEND FAILED:", err.message)
  }
}

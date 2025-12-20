import fetch from "node-fetch"

export async function sendTelegramMessage(chatId, text) {
  if (!process.env.TELEGRAM_BOT_TOKEN) {
    console.error("TELEGRAM_BOT_TOKEN ontbreekt")
    return
  }

  await fetch(
    `https://api.telegram.org/bot${process.env.TELEGRAM_BOT_TOKEN}/sendMessage`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: chatId,
        text
      })
    }
  )
}

export function extractTelegramMessage(body) {
  const msg = body?.message
  if (!msg || !msg.text) {
    console.log("TELEGRAM_RECEIVER_EMPTY")
    return null
  }

  return {
    chatId: msg.chat.id.toString(),
    username: msg.from?.username || null,
    text: msg.text
  }
}

import { getOrCreateSession } from "../llm/chatSessionManager.js"
import { storeMessage } from "../llm/conversationStore.js"
import { buildContext } from "../llm/contextBuilder.js"
import { chatRespond } from "../llm/chatResponder.js"
import { sendTelegram } from "./telegramSender.js"

export async function handleConversation(chatId, text) {
  try {
    const session = await getOrCreateSession(chatId)

    await storeMessage(session.id, "user", text)

    const context = await buildContext(session.id)
    if (!context) {
      console.error("CONTEXT_LEEG", session.id)
      return
    }

    const reply = await chatRespond(context)
    if (!reply) {
      console.error("REPLY_LEEG", session.id)
      return
    }

    await storeMessage(session.id, "assistant", reply)
    await sendTelegram(chatId, reply)

  } catch (err) {
    console.error("TELEGRAM_CONVERSATION_ERROR", err.message)
  }
}

import { getOrCreateSession } from "../llm/chatSessionManager.js"
import { storeMessage } from "../llm/conversationStore.js"
import { buildContext } from "../llm/contextBuilder.js"
import { chatRespond } from "../llm/chatResponder.js"
import { sendTelegram } from "./telegramSender.js"

export async function handleConversation(chatId, text) {
  const session = await getOrCreateSession(chatId)
  await storeMessage(session.id, "user", text)

  const context = await buildContext(session.id)
  const reply = await chatRespond(context)

  await storeMessage(session.id, "assistant", reply)
  await sendTelegram(chatId, reply)
}

import { createClient } from "@supabase/supabase-js"
import { interpretTelegramMessage } from "../llm/telegramInterpreter.js"

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
)

export async function handleTelegramWebhook(req, res) {
  const msg = req.body.message
  if (!msg || !msg.text) return res.sendStatus(200)

  const chatId = msg.chat.id.toString()
  const username = msg.from.username || null
  const text = msg.text

  // 1. Opslaan
  const { data } = await supabase
    .from("telegram_messages")
    .insert({
      chat_id: chatId,
      username,
      message: text
    })
    .select()
    .single()

  // 2. Interpreteren via ChatGPT
  const interpreted = await interpretTelegramMessage(text)

  // 3. Update log
  await supabase
    .from("telegram_messages")
    .update({
      interpreted_action: interpreted.actionId,
      payload: interpreted.payload,
      status: "interpreted"
    })
    .eq("id", data.id)

  // 4. Task aanmaken
  await supabase.from("tasks").insert({
    type: interpreted.type,
    status: "open",
    payload: interpreted.payload,
    assigned_to: "executor"
  })

  res.sendStatus(200)
}

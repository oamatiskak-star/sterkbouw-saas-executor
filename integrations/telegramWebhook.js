// routes: sterkbouw-saas-executor/integrations/telegramWebhook.js

import { createClient } from "@supabase/supabase-js"
import { interpretTelegramMessage } from "../llm/telegramInterpreter.js"
import { sendTelegramMessage } from "./telegram.js"

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

  // 1. Opslaan inkomend bericht
  const { data: log } = await supabase
    .from("telegram_messages")
    .insert({
      chat_id: chatId,
      username,
      message: text,
      status: "received"
    })
    .select()
    .single()

  // 2. Interpreteren via ChatGPT
  const interpreted = await interpretTelegramMessage(text)

  // 3. Terugpraten naar gebruiker
  if (interpreted.actionId === "system_clarify") {
    await sendTelegramMessage(
      chatId,
      interpreted.payload.question
    )

    await supabase
      .from("telegram_messages")
      .update({
        interpreted_action: "clarify",
        payload: interpreted.payload,
        status: "clarification_requested"
      })
      .eq("id", log.id)

    return res.sendStatus(200)
  }

  await sendTelegramMessage(
    chatId,
    `Ik heb dit begrepen:\n\n` +
    `Actie: ${interpreted.actionId}\n` +
    `Type: ${interpreted.type}\n\n` +
    `Ik ga dit nu uitvoeren.`
  )

  // 4. Update log
  await supabase
    .from("telegram_messages")
    .update({
      interpreted_action: interpreted.actionId,
      payload: interpreted.payload,
      status: "interpreted"
    })
    .eq("id", log.id)

  // 5. Task aanmaken voor executor
  await supabase.from("tasks").insert({
    type: interpreted.type,
    action_id: interpreted.actionId,
    status: "open",
    payload: interpreted.payload,
    assigned_to: "executor",
    source: "telegram"
  })

  await sendTelegramMessage(
    chatId,
    "Taak is aangemaakt en staat in de wachtrij."
  )

  res.sendStatus(200)
}

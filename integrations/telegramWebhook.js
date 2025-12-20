// ROUTE: sterkbouw-saas-executor/integrations/telegramWebhook.js

import { createClient } from "@supabase/supabase-js"
import { interpretTelegramMessage } from "../llm/telegramInterpreter.js"
import { sendTelegramMessage } from "./telegram.js"

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
)

export async function handleTelegramWebhook(req, res) {
  const msg = req.body?.message
  if (!msg || !msg.text) return res.sendStatus(200)

  const chatId = msg.chat.id.toString()
  const username = msg.from?.username || null
  const text = msg.text

  // 1. Log inkomend bericht
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

  // 2. Interpreteren via ChatGPT Core
  const interpreted = await interpretTelegramMessage(text)

  // 3. Terugpraten (volledig ChatGPT-achtig)
  if (interpreted.type === "system:clarify") {
    await sendTelegramMessage(
      chatId,
      interpreted.payload.message || "Kun je dit verder toelichten?"
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
    `Ik begrijp je.\n\n` +
    `Actie: ${interpreted.actionId}\n` +
    `Ik ga dit voorbereiden.\n\n` +
    `Bevestig met: bevestig`
  )

  // 4. Update interpretatie-log
  await supabase
    .from("telegram_messages")
    .update({
      interpreted_action: interpreted.actionId,
      payload: interpreted.payload,
      status: "interpreted"
    })
    .eq("id", log.id)

  // 5. Task klaarzetten (nog niet uitvoeren)
  await supabase.from("tasks").insert({
    type: interpreted.type,
    action_id: interpreted.actionId,
    status: "open",
    payload: {
      ...interpreted.payload,
      chat_id: chatId
    },
    assigned_to: "executor",
    source: "telegram"
  })

  await sendTelegramMessage(
    chatId,
    "Taak is aangemaakt. Wacht op bevestiging of aanvullende instructie."
  )

  res.sendStatus(200)
}

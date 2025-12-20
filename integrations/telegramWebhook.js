import { createClient } from "@supabase/supabase-js"
import { interpretTelegramMessage } from "../llm/telegramInterpreter.js"
import { sendTelegramMessage } from "./telegram.js"

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
)

export async function handleTelegramWebhook(req, res) {
  // 🚨 CRITISCH: Telegram ALTIJD direct OK
  res.sendStatus(200)

  try {
    const msg = req.body?.message
    if (!msg || !msg.text) return

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

    let interpreted
    try {
      interpreted = await interpretTelegramMessage(text)
    } catch (err) {
      await sendTelegramMessage(
        chatId,
        "Ik kan je bericht nu niet verwerken. Probeer het zo opnieuw te formuleren."
      )

      await supabase
        .from("telegram_messages")
        .update({
          status: "failed",
          error: err.message
        })
        .eq("id", log.id)

      return
    }

    // 2. Clarify-modus
    if (interpreted.type === "system:clarify") {
      await sendTelegramMessage(
        chatId,
        interpreted.payload?.message || "Kun je dit verduidelijken?"
      )

      await supabase
        .from("telegram_messages")
        .update({
          interpreted_action: "clarify",
          payload: interpreted.payload,
          status: "clarification_requested"
        })
        .eq("id", log.id)

      return
    }

    // 3. Terugpraten zoals ChatGPT
    await sendTelegramMessage(
      chatId,
      `Ik begrijp je.\n\nActie: ${interpreted.actionId}\n\nIk bereid dit nu voor.`
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

    // 5. Task aanmaken
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
      "Taak is aangemaakt en staat klaar voor uitvoering."
    )

  } catch (fatal) {
    // ❗ NOOIT throwen richting Telegram
    console.error("TELEGRAM_WEBHOOK_FATAL", fatal.message)
  }
}

import { createClient } from "@supabase/supabase-js"
import { interpretTelegramMessage } from "../llm/telegramInterpreter.js"
import { sendTelegram } from "./telegramSender.js"

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
)

export async function handleTelegramWebhook(body) {
  try {
    const msg = body?.message
    if (!msg || !msg.text) {
      console.log("TELEGRAM_UPDATE_ZONDER_TEKST")
      return
    }

    const chatId = msg.chat.id.toString()
    const username = msg.from?.username || null
    const text = msg.text

    console.log("TELEGRAM_ONTVANGEN:", chatId, text)

    // 1. Log inkomend bericht
    const { data: log, error: logError } = await supabase
      .from("telegram_messages")
      .insert({
        chat_id: chatId,
        username,
        message: text,
        status: "received"
      })
      .select()
      .single()

    if (logError || !log) {
      console.error("TELEGRAM_LOG_ERROR", logError?.message)
      return
    }

    let interpreted
    try {
      interpreted = await interpretTelegramMessage(text)
    } catch (err) {
      await sendTelegram(
        chatId,
        "Ik kan je bericht nu niet verwerken. Formuleer het anders."
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

    if (!interpreted || !interpreted.type) {
      console.error("INTERPRET_EMPTY")
      return
    }

    // 2. Clarify-modus
    if (interpreted.type === "system:clarify") {
      await sendTelegram(
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

    // 3. Terugkoppeling
    await sendTelegram(
      chatId,
      `Ik begrijp je.\n\nActie: ${interpreted.actionId}\n\nIk zet dit klaar.`
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

    await sendTelegram(
      chatId,
      "Taak is aangemaakt en klaar voor uitvoering."
    )

  } catch (fatal) {
    console.error("TELEGRAM_WEBHOOK_FATAL", fatal.message)
  }
}

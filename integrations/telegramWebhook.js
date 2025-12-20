import { createClient } from "@supabase/supabase-js"
import { interpretTelegramMessage } from "../llm/telegramInterpreter.js"
import { sendTelegram } from "./telegramSender.js"

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
)

export async function handleTelegramWebhook(body) {
  try {
    // ========================
    // HARD DEBUG – RAW INPUT
    // ========================
    console.log("TG_RAW", JSON.stringify(body))

    const msg = body?.message
    if (!msg || !msg.text) {
      console.log("TG_NO_TEXT")
      return
    }

    // ========================
    // ANTI ECHO / BOT FILTER
    // ========================
    if (msg.from?.is_bot) {
      console.log("TG_IGNORED_BOT_MESSAGE")
      return
    }

    const chatId = msg.chat.id.toString()
    const username = msg.from?.username || null
    const text = msg.text.trim()

    console.log("TG_TEXT_RECEIVED", chatId, text)

    // ========================
    // HARD ECHO – BEWIJS ONTVANGST
    // ========================
    await sendTelegram(chatId, `ONTvangen: ${text}`)

    // ========================
    // LOG IN SUPABASE
    // ========================
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

    // ========================
    // INTERPRETER
    // ========================
    let interpreted
    try {
      interpreted = await interpretTelegramMessage(text)
      console.log("TG_INTERPRETED", interpreted)
    } catch (err) {
      await sendTelegram(
        chatId,
        "Interpreter faalde. Probeer het anders te formuleren."
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

    // ========================
    // CLARIFY MODE
    // ========================
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

    // ========================
    // TERUGKOPPELING
    // ========================
    await sendTelegram(
      chatId,
      `Actie herkend: ${interpreted.actionId}`
    )

    // ========================
    // TASK AANMAKEN
    // ========================
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

    await sendTelegram(chatId, "Taak aangemaakt en klaar voor uitvoering.")

    await supabase
      .from("telegram_messages")
      .update({
        interpreted_action: interpreted.actionId,
        payload: interpreted.payload,
        status: "task_created"
      })
      .eq("id", log.id)

  } catch (fatal) {
    console.error("TELEGRAM_WEBHOOK_FATAL", fatal.message)
  }
}

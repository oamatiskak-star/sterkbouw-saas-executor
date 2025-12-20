import { createClient } from "@supabase/supabase-js"
import { interpretTelegramMessage } from "../llm/telegramInterpreter.js"
import { sendTelegram } from "./telegramSender.js"
import { routeCommand } from "../telegram/commandRouter.js"

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
)

export async function handleTelegramWebhook(body) {
  try {
    console.log("TG_RAW", JSON.stringify(body))

    const msg = body?.message
    if (!msg || !msg.text) {
      console.log("TG_NO_TEXT")
      return
    }

    if (msg.from?.is_bot) {
      console.log("TG_BOT_IGNORED")
      return
    }

    const chatId = msg.chat.id.toString()
    const username = msg.from?.username || null
    const text = msg.text.trim()

    console.log("TG_TEXT_RECEIVED", chatId, text)

    // =========================
    // 1. COMMAND ROUTER – HARD FIRST
    // =========================
    const routed = routeCommand(text)

    if (routed && routed.actionId && routed.actionId !== "UNKNOWN") {
      if (routed.reply) {
        await sendTelegram(chatId, routed.reply)
      }

      if (routed.actionId !== "HELP") {
        await supabase.from("tasks").insert({
          type: "telegram:command",
          action_id: routed.actionId,
          status: "open",
          payload: {
            chat_id: chatId,
            command: text
          },
          assigned_to: "executor",
          source: "telegram"
        })
      }

      await supabase.from("telegram_messages").insert({
        chat_id: chatId,
        username,
        message: text,
        interpreted_action: routed.actionId,
        status: "command_routed"
      })

      console.log("TG_COMMAND_ROUTED", routed.actionId)
      return
    }

    // =========================
    // 2. LLM – ALLEEN VRIJE TEKST
    // =========================
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
      console.log("TG_INTERPRETED", interpreted)
    } catch (err) {
      await sendTelegram(chatId, "Ik snap dit nog niet. Formuleer anders.")
      return
    }

    if (!interpreted || !interpreted.type) {
      console.log("TG_INTERPRET_EMPTY")
      return
    }

    if (interpreted.type === "system:clarify") {
      await sendTelegram(
        chatId,
        interpreted.payload?.message || "Kun je dit verduidelijken?"
      )
      return
    }

    await sendTelegram(
      chatId,
      `Actie herkend: ${interpreted.actionId}`
    )

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

    await supabase
      .from("telegram_messages")
      .update({
        interpreted_action: interpreted.actionId,
        payload: interpreted.payload,
        status: "task_created"
      })
      .eq("id", log.id)

    await sendTelegram(chatId, "Taak aangemaakt.")

  } catch (fatal) {
    console.error("TELEGRAM_WEBHOOK_FATAL", fatal.message)
  }
}

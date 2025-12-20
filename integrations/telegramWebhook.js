import { createClient } from "@supabase/supabase-js"
import { interpretTelegramMessage } from "../llm/telegramInterpreter.js"
import { sendTelegram } from "./telegramSender.js"

/*
====================================================
TELEGRAM WEBHOOK – DEFINITIEF
- COMMANDS + CHATGPT
- ALTIJD REACTIE
- GEEN STILTE
====================================================
*/

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
)

/*
====================================================
COMMAND MATRIX
====================================================
*/
function resolveCommand(text) {
  if (!text) return null
  const t = text.trim().toLowerCase()

  if (["/start", "start"].includes(t))
    return { actionId: "SYSTEM_START", reply: "AO actief. Typ `help`." }

  if (["help", "hulp", "?"].includes(t))
    return {
      actionId: "SYSTEM_HELP",
      reply:
        "Commando’s:\n" +
        "scan, status, health, build, force build\n" +
        "calculatie, dashboard, cashflow\n" +
        "Of stel gewoon een vraag."
    }

  if (["status", "waar zijn we", "hoe staan we"].includes(t))
    return { actionId: "SYSTEM_STATUS", reply: "Status wordt opgehaald." }

  if (["health", "ping"].includes(t))
    return { actionId: "SYSTEM_HEALTH", reply: "Health check gestart." }

  if (["scan", "scan bron"].includes(t))
    return { actionId: "ARCHITECT_SYSTEM_SCAN", reply: "Systeemscan gestart." }

  if (["build", "force build"].includes(t))
    return { actionId: "BUILDER_RUN", reply: "Build gestart." }

  if (["calculatie", "start calculatie"].includes(t))
    return { actionId: "BACKEND_START_CALCULATION", reply: "Calculatie gestart." }

  if (["dashboard"].includes(t))
    return { actionId: "FRONTEND_DASHBOARD", reply: "Dashboard openen." }

  return null
}

/*
====================================================
WEBHOOK HANDLER
====================================================
*/
export async function handleTelegramWebhook(body) {
  try {
    const msg = body?.message
    if (!msg || !msg.text || !msg.chat?.id) return

    const chatId = msg.chat.id.toString()
    const text = msg.text

    console.log("TG_TEXT_RECEIVED", chatId, text)

    /*
    ============================
    1. COMMANDS
    ============================
    */
    const cmd = resolveCommand(text)

    if (cmd) {
      if (cmd.reply) await sendTelegram(chatId, cmd.reply)

      await supabase.from("tasks").insert({
        type: cmd.actionId,
        action_id: cmd.actionId,
        status: "open",
        payload: { chat_id: chatId, text },
        assigned_to: "executor"
      })

      return
    }

    /*
    ============================
    2. CHATGPT (ALTIJD ANTWOORD)
    ============================
    */
    const interpreted = await interpretTelegramMessage(text)

    // 👉 GEEN ACTIE → GEWOON PRATEN
    if (!interpreted?.actionId) {
      if (interpreted?.reply) {
        await sendTelegram(chatId, interpreted.reply)
        return
      }

      await sendTelegram(chatId, "Ik luister. Kun je dit anders formuleren?")
      return
    }

    // 👉 ACTIE + UITLEG
    await sendTelegram(
      chatId,
      interpreted.reply ||
        `Begrepen. Ik ga dit uitvoeren:\n${interpreted.actionId}`
    )

    await supabase.from("tasks").insert({
      type: interpreted.type || interpreted.actionId,
      action_id: interpreted.actionId,
      status: "open",
      payload: { ...interpreted.payload, chat_id: chatId, text },
      assigned_to: "executor"
    })

  } catch (err) {
    console.error("TELEGRAM_WEBHOOK_FATAL", err.message)
  }
}

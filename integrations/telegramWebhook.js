import { createClient } from "@supabase/supabase-js"
import { interpretTelegramMessage } from "../llm/telegramInterpreter.js"
import { sendTelegram } from "./telegramSender.js"

/*
====================================================
TELEGRAM WEBHOOK – DEFINITIEF
- ALLE COMMANDO'S
- COMMANDS EERST
- LLM ALLEEN FALLBACK
- ÉÉN INGANG
====================================================
*/

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
)

/*
====================================================
COMMAND MATRIX – ALLES
====================================================
*/
function resolveCommand(text) {
  if (!text) return { actionId: "UNKNOWN" }
  const t = text.trim().toLowerCase()

  // SYSTEM / META
  if (["/start", "start"].includes(t))
    return { actionId: "SYSTEM_START", reply: "AO Executor actief. Typ `help`." }

  if (["help", "hulp", "menu", "?"].includes(t))
    return {
      actionId: "SYSTEM_HELP",
      reply:
        "Commando’s:\n" +
        "scan | status | health | build | force build | deploy | rollback\n" +
        "dashboard | routes fix | ui build | logs | debug | stop | restart | reset\n" +
        "calc | db sync | refresh ui | cashflow | haalbaarheid"
    }

  if (["status", "waar zijn we", "hoe staan we", "status waar zijn we nu?"].includes(t))
    return { actionId: "SYSTEM_STATUS", reply: "Status ophalen." }

  if (["health", "health check", "ping"].includes(t))
    return { actionId: "SYSTEM_HEALTH", reply: "Health check gestart." }

  // ARCHITECT
  if (["scan", "scan bron", "scan source", "system scan"].includes(t))
    return { actionId: "ARCHITECT_SYSTEM_SCAN", reply: "Systeemscan gestart." }

  if (["ui build", "build ui", "bouw ui", "ui opnieuw"].includes(t))
    return { actionId: "ARCHITECT_BUILD_UI", reply: "UI build gestart." }

  if (["routes fix", "route fix", "routes herstellen"].includes(t))
    return { actionId: "ARCHITECT_ROUTE_FIX", reply: "Routes herstellen." }

  // BUILDER
  if (["build", "run build"].includes(t))
    return { actionId: "BUILDER_RUN", reply: "Build gestart." }

  if (["force build", "force deploy"].includes(t))
    return { actionId: "BUILDER_FORCE", reply: "Force build gestart." }

  if (["deploy", "push live"].includes(t))
    return { actionId: "BUILDER_DEPLOY", reply: "Deploy gestart." }

  if (["rollback", "terugdraaien"].includes(t))
    return { actionId: "BUILDER_ROLLBACK", reply: "Rollback gestart." }

  // EXECUTOR / CONTROL
  if (["stop", "halt"].includes(t))
    return { actionId: "EXECUTOR_STOP", reply: "Executor stopt." }

  if (["restart", "herstart", "reboot"].includes(t))
    return { actionId: "EXECUTOR_RESTART", reply: "Executor herstart." }

  if (["reset", "opschonen"].includes(t))
    return { actionId: "EXECUTOR_RESET", reply: "Executor reset." }

  if (["logs", "debug", "trace"].includes(t))
    return { actionId: "EXECUTOR_DEBUG", reply: "Debugmodus actief." }

  // BACKEND / DATA
  if (["calc", "calculatie", "start calculatie", "bereken"].includes(t))
    return { actionId: "BACKEND_START_CALCULATION", reply: "Calculatie gestart." }

  if (["db sync", "sync database"].includes(t))
    return { actionId: "BACKEND_DB_SYNC", reply: "Database sync gestart." }

  // FRONTEND
  if (["dashboard", "open dashboard"].includes(t))
    return { actionId: "FRONTEND_DASHBOARD", reply: "Dashboard openen." }

  if (["refresh ui", "ui verversen"].includes(t))
    return { actionId: "FRONTEND_REFRESH", reply: "UI verversen." }

  // FINANCIEEL / PROJECT
  if (["cashflow", "liquiditeit"].includes(t))
    return { actionId: "FINANCE_CASHFLOW", reply: "Cashflow berekenen." }

  if (["haalbaarheid", "analyse"].includes(t))
    return { actionId: "FINANCE_FEASIBILITY", reply: "Haalbaarheidsanalyse." }

  // GEEN MATCH → LLM
  return { actionId: "CHATGPT_FALLBACK" }
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

    // 1. COMMANDS EERST
    const cmd = resolveCommand(text)

    if (cmd.actionId && cmd.actionId !== "CHATGPT_FALLBACK") {
      if (cmd.reply) await sendTelegram(chatId, cmd.reply)

      await supabase.from("tasks").insert({
        type: cmd.actionId,
        action_id: cmd.actionId,
        status: "open",
        payload: { chat_id: chatId, text },
        assigned_to: "executor",
        source: "telegram_command"
      })

      console.log("TG_COMMAND_EXECUTED", cmd.actionId)
      return
    }

    // 2. LLM FALLBACK
    const interpreted = await interpretTelegramMessage(text)

    if (!interpreted || !interpreted.actionId) {
      await sendTelegram(chatId, "Ik begrijp dit niet.")
      return
    }

    await sendTelegram(chatId, `Begrepen.\nActie: ${interpreted.actionId}`)

    await supabase.from("tasks").insert({
      type: interpreted.type || interpreted.actionId,
      action_id: interpreted.actionId,
      status: "open",
      payload: { ...interpreted.payload, chat_id: chatId, text },
      assigned_to: "executor",
      source: "telegram_llm"
    })

    console.log("TG_LLM_EXECUTED", interpreted.actionId)

  } catch (err) {
    console.error("TELEGRAM_WEBHOOK_FATAL", err.message)
  }
}

/*
====================================================
AO COMMAND MATRIX – VOLLEDIG
ENIGE BRON VAN WAARHEID
TELEGRAM + CHATGPT INPUT
====================================================
*/

export function resolveCommand(input) {
  if (!input || typeof input !== "string") {
    return { actionId: "UNKNOWN", reply: null }
  }

  const text = input.trim().toLowerCase()

  /*
  ====================================================
  SYSTEM / META
  ====================================================
  */
  if (["/start", "start"].includes(text)) {
    return { actionId: "SYSTEM_START", reply: "AO Executor actief." }
  }

  if (["help", "hulp", "menu", "?"].includes(text)) {
    return {
      actionId: "SYSTEM_HELP",
      reply:
        "Commando’s:\n" +
        "scan | status | health | build | force build | deploy | rollback\n" +
        "dashboard | logs | debug | stop | restart | reset\n"
    }
  }

  if (["status", "waar zijn we", "hoe staan we"].includes(text)) {
    return { actionId: "SYSTEM_STATUS", reply: "Status ophalen." }
  }

  if (["health", "health check", "ping"].includes(text)) {
    return { actionId: "SYSTEM_HEALTH", reply: "Health check gestart." }
  }

  /*
  ====================================================
  ARCHITECT
  ====================================================
  */
  if (["scan", "scan bron", "system scan"].includes(text)) {
    return { actionId: "ARCHITECT_SYSTEM_SCAN", reply: "Architect scan gestart." }
  }

  if (["build ui", "bouw ui", "ui opnieuw"].includes(text)) {
    return { actionId: "ARCHITECT_BUILD_UI", reply: "UI wordt opgebouwd." }
  }

  if (["route fix", "routes herstellen"].includes(text)) {
    return { actionId: "ARCHITECT_ROUTE_FIX", reply: "Routes worden hersteld." }
  }

  /*
  ====================================================
  BUILDER
  ====================================================
  */
  if (["build", "run build"].includes(text)) {
    return { actionId: "BUILDER_RUN", reply: "Build gestart." }
  }

  if (["force build", "force deploy"].includes(text)) {
    return { actionId: "BUILDER_FORCE", reply: "Force build gestart." }
  }

  if (["deploy", "push live"].includes(text)) {
    return { actionId: "BUILDER_DEPLOY", reply: "Deploy gestart." }
  }

  if (["rollback", "terugdraaien"].includes(text)) {
    return { actionId: "BUILDER_ROLLBACK", reply: "Rollback gestart." }
  }

  /*
  ====================================================
  EXECUTOR / CONTROL
  ====================================================
  */
  if (["stop", "halt"].includes(text)) {
    return { actionId: "EXECUTOR_STOP", reply: "Executor stopt." }
  }

  if (["restart", "herstart", "reboot"].includes(text)) {
    return { actionId: "EXECUTOR_RESTART", reply: "Executor herstart." }
  }

  if (["reset", "opschonen"].includes(text)) {
    return { actionId: "EXECUTOR_RESET", reply: "Executor reset." }
  }

  if (["debug", "logs", "trace"].includes(text)) {
    return { actionId: "EXECUTOR_DEBUG", reply: "Debugmodus actief." }
  }

  /*
  ====================================================
  BACKEND / DATA
  ====================================================
  */
  if (["start calculatie", "bereken"].includes(text)) {
    return { actionId: "BACKEND_START_CALCULATION", reply: "Calculatie gestart." }
  }

  if (["sync database", "db sync"].includes(text)) {
    return { actionId: "BACKEND_DB_SYNC", reply: "Database synchronisatie." }
  }

  /*
  ====================================================
  FRONTEND
  ====================================================
  */
  if (["dashboard", "open dashboard"].includes(text)) {
    return { actionId: "FRONTEND_DASHBOARD", reply: "Dashboard openen." }
  }

  if (["refresh ui", "ui verversen"].includes(text)) {
    return { actionId: "FRONTEND_REFRESH", reply: "UI ververst." }
  }

  /*
  ====================================================
  FINANCIEEL / PROJECT (voorbereid)
  ====================================================
  */
  if (["cashflow", "liquiditeit"].includes(text)) {
    return { actionId: "FINANCE_CASHFLOW", reply: "Cashflow berekenen." }
  }

  if (["haalbaarheid", "analyse"].includes(text)) {
    return { actionId: "FINANCE_FEASIBILITY", reply: "Haalbaarheidsanalyse." }
  }

  /*
  ====================================================
  CHATGPT / VRIJE TEKST
  ====================================================
  */
  return {
    actionId: "CHATGPT_FALLBACK",
    reply: null,
    payload: { text }
  }
}

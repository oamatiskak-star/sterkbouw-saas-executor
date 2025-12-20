/*
====================================================
TELEGRAM / CHATGPT COMMAND MATRIX
ENIGE WAARHEID
GEEN LOGICA, GEEN EXECUTIE
ALLEEN INTENT → ACTION
====================================================
*/

export function resolveCommand(input) {
  if (!input || typeof input !== "string") {
    return { actionId: "UNKNOWN", reply: null }
  }

  const text = input.trim().toLowerCase()

  /*
  ========================
  SYSTEM / META
  ========================
  */
  if (["/start", "start"].includes(text)) {
    return {
      actionId: "SYSTEM_START",
      reply: "AO Executor is actief. Typ `help` voor opties."
    }
  }

  if (["help", "hulp", "menu", "?"].includes(text)) {
    return {
      actionId: "SYSTEM_HELP",
      reply:
        "Beschikbare commando’s:\n" +
        "- scan\n" +
        "- status\n" +
        "- health\n" +
        "- build\n" +
        "- force build\n" +
        "- herstart\n" +
        "- dashboard\n" +
        "- stop\n" +
        "- debug\n" +
        "- deploy\n"
    }
  }

  if (["status", "waar zijn we", "hoe staat het"].includes(text)) {
    return {
      actionId: "SYSTEM_STATUS",
      reply: "Status wordt opgehaald."
    }
  }

  if (["health", "health check", "ping"].includes(text)) {
    return {
      actionId: "SYSTEM_HEALTH",
      reply: "Health check gestart."
    }
  }

  /*
  ========================
  ARCHITECT
  ========================
  */
  if (["scan", "scan bron", "scan source"].includes(text)) {
    return {
      actionId: "ARCHITECT_SYSTEM_SCAN",
      reply: "Systeemscan gestart."
    }
  }

  if (["build ui", "dashboard", "bouw ui"].includes(text)) {
    return {
      actionId: "ARCHITECT_BUILD_UI",
      reply: "UI build gestart."
    }
  }

  /*
  ========================
  BUILDER
  ========================
  */
  if (["build", "run build", "deploy"].includes(text)) {
    return {
      actionId: "BUILDER_RUN",
      reply: "Build gestart."
    }
  }

  if (["force build", "force deploy"].includes(text)) {
    return {
      actionId: "BUILDER_FORCE",
      reply: "Force build gestart."
    }
  }

  /*
  ========================
  EXECUTOR / CONTROL
  ========================
  */
  if (["stop", "halt"].includes(text)) {
    return {
      actionId: "EXECUTOR_STOP",
      reply: "Executor wordt gestopt."
    }
  }

  if (["herstart", "restart", "reboot"].includes(text)) {
    return {
      actionId: "EXECUTOR_RESTART",
      reply: "Executor herstart wordt uitgevoerd."
    }
  }

  if (["debug", "logs", "trace"].includes(text)) {
    return {
      actionId: "EXECUTOR_DEBUG",
      reply: "Debugmodus geactiveerd."
    }
  }

  /*
  ========================
  CHATGPT / VRIJE TEKST
  ========================
  */
  return {
    actionId: "CHATGPT_FALLBACK",
    reply: null,
    payload: {
      text
    }
  }
}

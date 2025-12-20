export function routeCommand(text) {
  const raw = text || ""
  const cmd = raw.trim().toLowerCase()

  console.log("[AO][ROUTER] ontvangen:", cmd)

  const is = (...list) => list.includes(cmd)

  if (is("scan bron", "scan", "scan source")) {
    return {
      actionId: "SCAN_SOURCE",
      reply: "Scan gestart"
    }
  }

  if (is("classificeer bron", "classificeer", "classify source", "classify")) {
    return {
      actionId: "CLASSIFY_SOURCE",
      reply: "Classificatie gestart"
    }
  }

  if (is("bouw doelstructuur", "build structure", "bouw structuur")) {
    return {
      actionId: "BUILD_STRUCTURE",
      reply: "Doelstructuur wordt opgebouwd"
    }
  }

  if (is("schrijf ontbrekende code", "write code", "generate code")) {
    return {
      actionId: "WRITE_CODE",
      reply: "Ontbrekende code wordt geschreven"
    }
  }

  if (is("health", "health check", "status")) {
    return {
      actionId: "HEALTH_CHECK",
      reply: "Health check gestart"
    }
  }

  if (is("help")) {
    return {
      actionId: "HELP",
      reply:
        "Beschikbare commando’s:\n" +
        "- scan bron\n" +
        "- classificeer bron\n" +
        "- bouw doelstructuur\n" +
        "- schrijf ontbrekende code\n" +
        "- health"
    }
  }

  return {
    actionId: "UNKNOWN",
    reply: "Onbekend commando. Typ: help"
  }
}

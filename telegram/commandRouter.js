// telegram/commandRouter.js

export function routeCommand(text, ctx) {
  const raw = text || ""
  const cmd = raw.trim().toLowerCase()

  console.log("[AO][ROUTER] ontvangen:", cmd)

  // helpers
  const reply = (msg) => {
    if (ctx && ctx.reply) ctx.reply(msg)
  }

  // aliases
  const is = (...list) => list.includes(cmd)

  // ROUTES

  if (is("scan bron", "scan", "scan source")) {
    reply("Scan gestart")
    console.log("[AO][CMD] scan bron")
    return { action: "SCAN_SOURCE" }
  }

  if (is("classificeer bron", "classificeer", "classify source", "classify")) {
    reply("Classificatie gestart")
    console.log("[AO][CMD] classificeer bron")
    return { action: "CLASSIFY_SOURCE" }
  }

  if (is("bouw doelstructuur", "build structure", "bouw structuur")) {
    reply("Doelstructuur wordt opgebouwd")
    console.log("[AO][CMD] bouw doelstructuur")
    return { action: "BUILD_STRUCTURE" }
  }

  if (is("schrijf ontbrekende code", "write code", "generate code")) {
    reply("Ontbrekende code wordt geschreven")
    console.log("[AO][CMD] schrijf ontbrekende code")
    return { action: "WRITE_CODE" }
  }

  if (is("health", "health check", "status")) {
    reply("Health check gestart")
    console.log("[AO][CMD] health check")
    return { action: "HEALTH_CHECK" }
  }

  if (is("help")) {
    reply(
      "Beschikbare commando’s:\n" +
      "- scan bron\n" +
      "- classificeer bron\n" +
      "- bouw doelstructuur\n" +
      "- schrijf ontbrekende code\n" +
      "- health"
    )
    console.log("[AO][CMD] help")
    return { action: "HELP" }
  }

  // DEFAULT
  reply("Onbekend commando. Typ: help")
  console.log("[AO][ROUTER] onbekend commando")
  return { action: "UNKNOWN" }
}

import fetch from "node-fetch"

export default function initTelegram(bot, ao) {
  console.log("[AO][TELEGRAM] router actief")

  bot.on("text", async (ctx) => {
    const text = (ctx.message.text || "").trim()
    const cmd = text.toLowerCase()

    console.log("[AO][TELEGRAM] ontvangen:", cmd)

    const reply = (msg) => ctx.reply(msg)

    const is = (...list) => list.includes(cmd)

    // SCAN
    if (is("scan bron", "scan", "scan source")) {
      reply("Scan gestart")
      console.log("[AO][CMD] scan bron")
      ao.emit("SCAN_SOURCE")
      return
    }

    // CLASSIFY
    if (is("classificeer bron", "classificeer", "classify source", "classify")) {
      reply("Classificatie gestart")
      console.log("[AO][CMD] classificeer bron")
      ao.emit("CLASSIFY_SOURCE")
      return
    }

    // BUILD STRUCTURE
    if (is("bouw doelstructuur", "bouw structuur", "build structure")) {
      reply("Doelstructuur wordt opgebouwd")
      console.log("[AO][CMD] bouw doelstructuur")
      ao.emit("BUILD_STRUCTURE")
      return
    }

    // WRITE CODE
    if (is("schrijf ontbrekende code", "write code", "generate code")) {
      reply("Ontbrekende code wordt geschreven")
      console.log("[AO][CMD] schrijf ontbrekende code")
      ao.emit("WRITE_CODE")
      return
    }

    // HEALTH
    if (is("health", "health check", "status")) {
      reply("Health check gestart")
      console.log("[AO][CMD] health")
      ao.emit("HEALTH_CHECK")
      return
    }

    // HELP
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
      return
    }

    // DEFAULT
    reply("Onbekend commando. Typ: help")
    console.log("[AO][CMD] onbekend commando")
  })
}

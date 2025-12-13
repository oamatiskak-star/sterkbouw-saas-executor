export default function initTelegram(bot, ao) {
  console.log("[AO][TELEGRAM] SterkBouw SaaS router actief")

  bot.on("text", async (ctx) => {
    const text = (ctx.message.text || "").trim()
    const cmd = text.toLowerCase()

    console.log("[AO][TELEGRAM] ontvangen:", cmd)

    const reply = (msg) => ctx.reply(msg)
    const is = (...list) => list.includes(cmd)

    // ====== HOOFDCOMMANDO ======
    if (
      is(
        "bouw sterkbouw",
        "start sterkbouw",
        "build",
        "alles bouwen",
        "sterkbouw"
      )
    ) {
      reply("SterkBouw SaaS bouw gestart")
      console.log("[AO][PIPELINE] START STERKBOUW SAAS")

      // Volledige pipeline, vaste volgorde
      ao.emit("SCAN_SOURCE")
      ao.emit("CLASSIFY_SOURCE")
      ao.emit("BUILD_SAAS_STRUCTURE")
      ao.emit("GENERATE_MISSING_CODE")
      ao.emit("APPLY_CODE")
      ao.emit("FINAL_HEALTH_CHECK")

      return
    }

    // ====== LOSSE COMMANDO’S (optioneel) ======
    if (is("scan bron")) {
      reply("Scan gestart")
      ao.emit("SCAN_SOURCE")
      return
    }

    // ====== HELP ======
    if (is("help")) {
      reply(
        "SterkBouw SaaS commando’s:\n" +
        "- bouw sterkbouw\n" +
        "- start sterkbouw\n" +
        "- build\n\n" +
        "Dit start automatisch:\n" +
        "scan → classificatie → structuur → code → health"
      )
      return
    }

    // ====== DEFAULT ======
    reply("Onbekend commando. Typ: help")
  })
}

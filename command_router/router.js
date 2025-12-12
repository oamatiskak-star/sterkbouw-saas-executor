import { sendTelegram } from "../telegram/telegram.js"
import * as pingHandler from "./handlers/ping.js"
import * as notifyHandler from "./handlers/notify.js"

export async function handleCommand(payload) {
  const ref = payload?.ref
  if (!ref) return

  if (ref === "refs/heads/main") {
    await sendTelegram("[AO] Push naar main ontvangen")
    await pingHandler.run()
    await notifyHandler.run("Push succesvol verwerkt.")
  }
}

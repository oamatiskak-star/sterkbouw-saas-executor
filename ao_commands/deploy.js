import axios from "axios"
import { sendTelegram } from "../ao_notifications/telegram.js"

export async function handleCommand(input) {
  const lower = input.toLowerCase()

  if (lower.includes("deploy front manual")) {
    await sendTelegram("🚀 Handmatige frontend-deploy gestart via hook")
    try {
      await axios.post("https://api.vercel.com/v1/integrations/deploy/prj_i5dPjdgofUOZsKDN3hspbBefFCKy/c8GNPbajGy")
      await sendTelegram("✅ Deploy via Vercel hook voltooid")
    } catch (e) {
      await sendTelegram("❌ Fout bij deploy hook: " + e.message)
    }
    return
  }

  // Voeg hier andere commando's toe...
}

import { registerUnknownCommand } from "../utils/registerUnknownCommand.js"

export async function runBuilder(payload = {}) {
  const actionId = payload.actionId

  try {
    switch (actionId) {

      case "frontend:install_tabler": {
        const m = await import("./frontend/installTabler.js")
        return await m.installTabler(payload)
      }

      case "frontend:apply_tabler_layout": {
        const m = await import("./frontend/applyTablerLayout.js")
        return await m.applyTablerLayout(payload)
      }

      case "frontend:generate_navigation": {
        const m = await import("./frontend/generateTablerNav.js")
        return await m.generateTablerNav(payload)
      }

      default:
        await registerUnknownCommand("builder", actionId)
        return { status: "ignored", actionId }
    }
  } catch (err) {
    return { status: "error", error: err.message }
  }
}

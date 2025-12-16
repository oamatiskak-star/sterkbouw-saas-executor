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

      case "frontend:deploy_gate_check": {
        const m = await import("./frontend/deployGateCheck.js")
        return await m.deployGateCheck(payload)
      }

      case "map:module_to_nav": {
        const m = await import("./tasks/mapModuleToNav.js")
        return await m.mapModuleToNav(payload)
      }

      case "builder:log_payload":
        console.log("BUILDER PAYLOAD:", payload)
        return { status: "ok" }

      default:
        await registerUnknownCommand("builder", actionId)
        return { status: "ignored", actionId }
    }

  } catch (err) {
    return { status: "error", actionId, error: err.message }
  }
}

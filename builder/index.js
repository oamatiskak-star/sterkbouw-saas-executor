import { registerUnknownCommand } from "../utils/registerUnknownCommand.js"

/*
========================
BUILDER ENTRY
========================
*/
export async function runBuilder(payload = {}) {
  const actionId = payload.actionId

  try {
    switch (actionId) {

      /*
      ========================
      BESTAANDE FRONTEND ACTIES
      ========================
      */
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

      case "frontend:generate_login": {
        const m = await import("./frontend/generateTablerLogin.js")
        return await m.generateTablerLogin(payload)
      }

      /*
      ========================
      NIEUW – PAGINA GENERATIE
      ========================
      frontend_write_file
      */
      case "frontend_write_file": {
        const m = await import("./frontend/generatePage.js")
        return await m.generatePage(payload)
      }

      /*
      ========================
      NIEUW – FRONTEND BUILD
      ========================
      frontend_build
      */
      case "frontend_build": {
        const m = await import("./frontend/frontendBuild.js")
        return await m.frontendBuild(payload)
      }

      /*
      ========================
      FALLBACK
      ========================
      */
      default:
        await registerUnknownCommand("builder", actionId)
        return { status: "ignored", actionId }
    }
  } catch (err) {
    return { status: "error", error: err.message }
  }
}

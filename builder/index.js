import { registerUnknownCommand } from "../utils/registerUnknownCommand.js"

/*
========================
BUILDER ENTRY
========================
*/
export async function runBuilder(payload = {}) {
  let actionId = payload.actionId

  // Veiligheid: normaliseer actionId
  if (actionId) {
    actionId = actionId
      .toLowerCase()
      .replace(/:/g, "_")
      .replace(/__+/g, "_")
  }

  try {
    switch (actionId) {

      /*
      ========================
      BESTAANDE FRONTEND ACTIES
      ========================
      */
      case "frontend_install_tabler": {
        const m = await import("./frontend/installTabler.js")
        return await m.installTabler(payload)
      }

      case "frontend_apply_tabler_layout": {
        const m = await import("./frontend/applyTablerLayout.js")
        return await m.applyTablerLayout(payload)
      }

      case "frontend_generate_navigation": {
        const m = await import("./frontend/generateTablerNav.js")
        return await m.generateTablerNav(payload)
      }

      case "frontend_generate_login": {
        const m = await import("./frontend/generateTablerLogin.js")
        return await m.generateTablerLogin(payload)
      }

      /*
      ========================
      PAGINA – SIMPEL
      ========================
      */
      case "frontend_write_file": {
        const m = await import("./frontend/generatePage.js")
        return await m.generatePage(payload)
      }

      /*
      ========================
      PAGINA – STANDAARD MET KPI + KNOPPEN
      ========================
      */
      case "frontend_generate_standard_page": {
        const m = await import("./frontend/generateStandardPage.js")
        return await m.generateStandardPage(payload)
      }

      /*
      ========================
      FRONTEND BUILD
      ========================
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

import { registerUnknownCommand } from "../utils/registerUnknownCommand.js"

/*
========================
BUILDER ENTRY
========================
*/
export async function runBuilder(payload = {}) {
  let actionId = payload.actionId

  // normaliseer
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
      PROJECT / REKENWOLK
      ========================
      */
      case "project_scan": {
        const m = await import("./actions/PROJECT_SCAN.js")
        return await m.default(payload)
      }

      case "start_rekenwolk": {
        const m = await import("./actions/START_REKENWOLK.js")
        return await m.default(payload)
      }

      /*
      ========================
      FRONTEND
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

      case "frontend_write_file": {
        const m = await import("./frontend/generatePage.js")
        return await m.generatePage(payload)
      }

      case "frontend_generate_standard_page": {
        const m = await import("./frontend/generateStandardPage.js")
        return await m.generateStandardPage(payload)
      }

      case "frontend_build": {
        const m = await import("./frontend/frontendBuild.js")
        return await m.frontendBuild(payload)
      }

      /*
      ========================
      BACKEND / SYSTEM (NO-OP HIER)
      – WORDEN IN EXECUTOR AFGEHANDELD
      ========================
      */
      case "backend_run_initialization":
      case "backend_start_calculation":
      case "system_post_deploy_verify":
      case "system_status":
      case "system_health": {
        return { status: "ok", actionId }
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
    return { status: "error", actionId, error: err.message }
  }
}

import { registerUnknownCommand } from "../utils/registerUnknownCommand.js"

/*
========================
BUILDER ENTRY – DEFINITIEF
========================
- gebruikt action (niet actionId)
- valideert payload hard
- geen executor statusbeheer
*/

function normalize(raw) {
  if (!raw || typeof raw !== "string") return null
  return raw
    .toLowerCase()
    .replace(/[^a-z0-9_]+/g, "_")
    .replace(/^_|_$/g, "")
}

export async function runBuilder(payload = {}) {
  if (!payload || typeof payload !== "object") {
    throw new Error("BUILDER_INVALID_PAYLOAD")
  }

  const rawAction = payload.action || payload.actionId
  const action = normalize(rawAction)

  if (!action) {
    throw new Error("BUILDER_ACTION_MISSING")
  }

  try {
    switch (action) {

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

      case "generate_stabu": {
        const m = await import("./actions/GENERATE_STABU.js")
        return await m.default(payload)
      }

      case "derive_quantities": {
        const m = await import("./actions/DERIVE_QUANTITIES.js")
        return await m.default(payload)
      }

      case "installaties_e": {
        const m = await import("./actions/INSTALLATIES_E.js")
        return await m.default(payload)
      }

      case "installaties_w": {
        const m = await import("./actions/INSTALLATIES_W.js")
        return await m.default(payload)
      }

      case "planning": {
        const m = await import("./actions/PLANNING.js")
        return await m.default(payload)
      }

      case "rapportage": {
        const m = await import("./actions/RAPPORTAGE.js")
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
      BACKEND / SYSTEM
      ========================
      */
      case "backend_run_initialization":
      case "backend_start_calculation":
      case "system_post_deploy_verify":
      case "system_status":
      case "system_health": {
        return { action, state: "SKIPPED" }
      }

      /*
      ========================
      FALLBACK
      ========================
      */
      default:
        await registerUnknownCommand("builder", action)
        return { action, state: "IGNORED" }
    }
  } catch (err) {
    throw new Error(`BUILDER_ACTION_FAILED (${action}): ${err.message}`)
  }
}

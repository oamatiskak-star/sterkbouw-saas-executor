import { registerUnknownCommand } from "../utils/registerUnknownCommand.js"

/*
================================================
BUILDER ENTRY – FREEZE / SYSTEM OF RECORD
================================================
- ALLE system / monteur / frontend / backend acties
- SQL-gedreven (executor_tasks / builder_tasks)
- Geen aannames
- Geen stil falen
================================================
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
      CORE CALCULATIE KETEN
      ========================
      */
      case "project_scan":
        return (await import("./actions/PROJECT_SCAN.js")).default(payload)

      case "generate_stabu":
        return (await import("./actions/GENERATE_STABU.js")).default(payload)

      case "derive_quantities":
        return (await import("./actions/DERIVE_QUANTITIES.js")).default(payload)

      case "create_calculatie":
        return (await import("./actions/CREATE_CALCULATIE.js")).default(payload)

      case "start_rekenwolk":
        return (await import("./actions/START_REKENWOLK.js")).default(payload)

      case "installaties_e":
        return (await import("./actions/INSTALLATIES_E.js")).default(payload)

      case "installaties_w":
        return (await import("./actions/INSTALLATIES_W.js")).default(payload)

      case "planning":
        return (await import("./actions/PLANNING.js")).default(payload)

      case "rapportage":
        return (await import("./actions/RAPPORTAGE.js")).default(payload)

      /*
      ========================
      SYSTEM / MONTEUR (CRUCIAAL)
      ========================
      */
      case "system_repair_full":
      case "repair_full_system":
        return (await import("./actions/SYSTEM_REPAIR_FULL.js")).default(payload)

      case "system_repair_full_chain":
        return (await import("./actions/SYSTEM_REPAIR_FULL_CHAIN.js")).default(payload)

      case "system_repair_upload_and_restart":
        return (await import("./actions/SYSTEM_REPAIR_UPLOAD_AND_RESTART.js")).default(payload)

      case "write_files":
        return (await import("./actions/WRITE_FILES.js")).default(payload)

      case "create_module":
        return (await import("./actions/CREATE_MODULE.js")).default(payload)

      case "system_full_scan":
        return (await import("./actions/SYSTEM_FULL_SCAN.js")).default(payload)

      /*
      ========================
      FRONTEND (AUTOMATISCH)
      ========================
      */
      case "frontend_install_tabler":
        return (await import("./frontend/installTabler.js")).installTabler(payload)

      case "frontend_apply_tabler_layout":
        return (await import("./frontend/applyTablerLayout.js")).applyTablerLayout(payload)

      case "frontend_generate_navigation":
        return (await import("./frontend/generateTablerNav.js")).generateTablerNav(payload)

      case "frontend_generate_login":
        return (await import("./frontend/generateTablerLogin.js")).generateTablerLogin(payload)

      case "frontend_generate_standard_page":
        return (await import("./frontend/generateStandardPage.js")).generateStandardPage(payload)

      case "frontend_build":
        return (await import("./frontend/frontendBuild.js")).frontendBuild(payload)

      /*
      ========================
      STATUS / HEALTH (NO-OP)
      ========================
      */
      case "system_status":
      case "system_health":
      case "system_post_deploy_verify":
        return { action, state: "OK" }

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

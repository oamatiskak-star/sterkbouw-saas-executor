import fs from "fs"
import path from "path"
import { fileURLToPath } from "url"
import { registerUnknownCommand } from "../utils/registerUnknownCommand.js"

/*
========================
BUILDER ENTRY – FREEZE
========================
- gebruikt action (niet actionId)
- valideert payload hard
- geen executor statusbeheer
- geen aannames
- alle uitbreidingen via losse actie-bestanden
*/

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

function normalize(raw) {
  if (!raw || typeof raw !== "string") return null
  return raw
    .toLowerCase()
    .replace(/[^a-z0-9_]+/g, "_")
    .replace(/^_|_$/g, "")
}

/*
========================
DYNAMISCHE ACTION LOADER
========================
- acties worden automatisch geladen uit:
  - builder/actions/
  - builder/frontend/
  - builder/system/
  - builder/monteur/
- dit bestand hoeft NOOIT meer aangepast te worden
*/

async function runDynamicAction(action, payload) {
  const candidates = [
    `./actions/${action}.js`,
    `./frontend/${action}.js`,
    `./system/${action}.js`,
    `./monteur/${action}.js`
  ]

  for (const rel of candidates) {
    const abs = path.join(__dirname, rel)
    if (fs.existsSync(abs)) {
      const mod = await import(rel)
      if (typeof mod.default === "function") {
        return await mod.default(payload)
      }
      if (typeof mod[action] === "function") {
        return await mod[action](payload)
      }
    }
  }

  return null
}

export async function runBuilder(payload = {}) {
  if (!payload || typeof payload !== "object") {
    throw new Error("BUILDER_INVALID_PAYLOAD")
  }

  const rawAction = payload.action || payload.actionId || payload.command
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
      case "project_scan":
      case "start_rekenwolk":
      case "generate_stabu":
      case "derive_quantities":
      case "installaties_e":
      case "installaties_w":
      case "planning":
      case "rapportage": {
        const result = await runDynamicAction(action, payload)
        if (result) return result
        throw new Error(`ACTION_FILE_MISSING (${action})`)
      }

      /*
      ========================
      SYSTEM / REPAIR / MONTEUR
      ========================
      */
      case "system_repair_full":
      case "system_repair_full_chain":
      case "system_repair_upload_and_restart":
      case "system_full_scan":
      case "repair_full_system":
      case "write_files":
      case "create_module":
      case "create_folder":
      case "delete_file":
      case "delete_folder":
      case "freeze":
      case "unfreeze": {
        const result = await runDynamicAction(action, payload)
        if (result) return result
        throw new Error(`SYSTEM_ACTION_MISSING (${action})`)
      }

      /*
      ========================
      FRONTEND
      ========================
      */
      case "frontend_install_tabler":
      case "frontend_apply_tabler_layout":
      case "frontend_generate_navigation":
      case "frontend_generate_login":
      case "frontend_generate_standard_page":
      case "frontend_build": {
        const result = await runDynamicAction(action, payload)
        if (result) return result
        throw new Error(`FRONTEND_ACTION_MISSING (${action})`)
      }

      /*
      ========================
      BACKEND / SYSTEM (NO-OP)
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
      FALLBACK – NO LOOP
      ========================
      */
      default:
        await registerUnknownCommand("builder", action)
        return {
          action,
          state: "IGNORED",
          reason: "UNKNOWN_BUT_REGISTERED"
        }
    }
  } catch (err) {
    throw new Error(`BUILDER_ACTION_FAILED (${action}): ${err.message}`)
  }
}

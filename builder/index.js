import { registerUnknownCommand } from "../utils/registerUnknownCommand.js"

/*
================================================
BUILDER ENTRY – DEFINITIEVE UITGEBREIDE VOLGORDE
================================================

AFGEDWONGEN VOLGORDE:
1. upload
2. generate_2jours_pdf
3. project_scan
4. generate_stabu
5. start_rekenwolk

REGELS:
- 2jours PDF is ALTIJD de drager
- Elke stap schrijft zijn resultaat direct weg in de PDF
- Geen losse outputs, geen tijdelijke staten
- Builder bewaakt de volgorde, acties zijn idempotent
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
      1. UPLOAD
      ========================
      - Bestanden uploaden
      - Metadata registreren
      - PDF-context voorbereiden
      */

      case "upload":
        return (await import("./actions/UPLOAD.js")).default({
          ...payload,
          pdf_mode: "2jours"
        })

      /*
      ========================
      2. GENERATE 2JOURS PDF
      ========================
      - Initieert of opent bestaande 2jours PDF
      - Zet basisdocumentstructuur
      */

      case "generate_pdf":
      case "generate_2jours_pdf":
        return (await import("./actions/GENERATE_2JOURS_PDF.js")).default({
          ...payload,
          pdf_mode: "2jours",
          pdf_role: "carrier"
        })

      /*
      ========================
      3. PROJECT SCAN
      ========================
      - Analyse tekeningen / documenten
      - Schrijft bevindingen DIRECT in 2jours PDF
      */

      case "project_scan":
        return (await import("./actions/PROJECT_SCAN.js")).default({
          ...payload,
          write_to_pdf: true,
          pdf_mode: "2jours"
        })

      /*
      ========================
      4. GENERATE STABU
      ========================
      - Opbouw STABU-structuur
      - Regels direct wegschrijven in 2jours PDF
      */

      case "generate_stabu":
        return (await import("./actions/GENERATE_STABU.js")).default({
          ...payload,
          write_to_pdf: true,
          pdf_mode: "2jours"
        })

      /*
      ========================
      5. START REKENWOLK
      ========================
      - Rekent STABU + projectdata door
      - ALLE resultaten direct naar 2jours PDF
      */

      case "start_rekenwolk":
        return (await import("./actions/START_REKENWOLK.js")).default({
          ...payload,
          write_to_pdf: true,
          pdf_mode: "2jours"
        })

      /*
      ========================
      SYSTEM / MONTEUR
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
      STATUS / HEALTH
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

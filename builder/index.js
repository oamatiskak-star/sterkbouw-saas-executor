/*
BUILDER
- WORDT AANGEROEPEN DOOR EXECUTOR VIA runAction
- ONTVANGT payload MET actionId
- ALLE IMPORTS ZIJN LAZY
- MAG NOOIT CRASHEN OP ONTBREKENDE FILES
*/

import { registerUnknownCommand } from "../utils/registerUnknownCommand.js"

export async function runBuilder(payload) {
  const { actionId } = payload || {}

  try {
    switch (actionId) {

      /*
      ========================
      GLOBALE FRONTEND LAYOUT
      ========================
      */
      case "frontend:force_dashboard_layout": {
        const m = await import("./frontend/applyGlobalLayout.js")
        return await m.applyGlobalLayout(payload)
      }

      /*
      ========================
      BUILDER MODULES
      ========================
      */
      case "builder:generate_module": {
        const m = await import("./moduleGenerator.js")
        return await m.generateModule(payload)
      }

      case "builder:generate_generic": {
        const m = await import("./moduleGenerator.js")
        return await m.generateGenericModule(payload)
      }

      case "builder:generate_login_form": {
        const m = await import("./loginForm.js")
        return await m.generateLoginForm(payload)
      }

      /*
      ========================
      CODE GENERATORS
      ========================
      */
      case "code:generate_api_route": {
        const m = await import("./tasks/codeGenerateApiRoute.js")
        return await m.generateApiRoute(payload)
      }

      case "code:generate_page": {
        const m = await import("./tasks/codeGeneratePage.js")
        return await m.generatePage(payload)
      }

      case "code:generate_component": {
        const m = await import("./tasks/codeGenerateComponent.js")
        return await m.generateComponent(payload)
      }

      case "code:generate_stylesheet": {
        const m = await import("./tasks/codeGenerateStylesheet.js")
        return await m.generateStylesheet(payload)
      }

      /*
      ========================
      ENV MANAGEMENT
      ========================
      */
      case "env:generate_file": {
        const m = await import("./tasks/envGenerateFile.js")
        return await m.generateEnvFile(payload)
      }

      case "env:sync_keys": {
        const m = await import("./tasks/envSyncKeys.js")
        return await m.syncEnvKeys(payload)
      }

      case "env:validate_setup": {
        const m = await import("./tasks/envValidateSetup.js")
        return await m.validateEnvSetup(payload)
      }

      /*
      ========================
      SYSTEM OPERATIONS
      ========================
      */
      case "system:full_scan": {
        const m = await import("./tasks/systemFullScan.js")
        return await m.fullSystemScan(payload)
      }

      case "system:generate_all_routes": {
        const m = await import("./tasks/systemGenerateRoutes.js")
        return await m.generateAllRoutes(payload)
      }

      case "system:generate_dashboard_template": {
        const m = await import("./tasks/systemGenerateDashboardTemplate.js")
        return await m.generateDashboardTemplate(payload)
      }

      /*
      ========================
      SQL / SUPABASE
      ========================
      */
      case "sql:generate_table": {
        const m = await import("./tasks/sqlGenerateTable.js")
        return await m.generateSqlTable(payload)
      }

      case "sql:generate_rls": {
        const m = await import("./tasks/sqlGenerateRls.js")
        return await m.generateRlsPolicy(payload)
      }

      case "sql:generate_relationships": {
        const m = await import("./tasks/sqlGenerateRelationships.js")
        return await m.generateRelationships(payload)
      }

      case "sql:scan_schema": {
        const m = await import("./tasks/sqlScanSchema.js")
        return await m.scanSchema(payload)
      }

      /*
      ========================
      MAPPINGS
      ========================
      */
      case "map:table_to_ui": {
        const m = await import("./tasks/mapTableToUi.js")
        return await m.mapTableToUi(payload)
      }

      case "map:route_to_page": {
        const m = await import("./tasks/mapRouteToPage.js")
        return await m.mapRouteToPage(payload)
      }

      case "map:module_to_nav": {
        const m = await import("./tasks/mapModuleToNav.js")
        return await m.mapModuleToNav(payload)
      }

      /*
      ========================
      TEST / DEBUG
      ========================
      */
      case "builder:test_task":
        return {
          status: "ok",
          message: "Builder test uitgevoerd",
          payload
        }

      case "builder:log_payload":
        console.log("BUILDER PAYLOAD:", payload)
        return {
          status: "ok",
          message: "Payload gelogd"
        }

      /*
      ========================
      FALLBACK
      ========================
      */
      default:
        await registerUnknownCommand("builder", actionId)
        return {
          status: "ignored",
          message: "Onbekende builder action",
          actionId
        }
    }

  } catch (err) {
    return {
      status: "error",
      actionId,
      error: err.message
    }
  }
}
``

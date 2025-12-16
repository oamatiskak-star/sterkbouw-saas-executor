// builder/index.js

import { generateModule } from "./moduleGenerator.js"
import { generateGenericModule } from "./moduleGenerator.js"
import { generateLoginForm } from "./loginForm.js"

import { generateApiRoute } from "./tasks/codeGenerateApiRoute.js"
import { generatePage } from "./tasks/codeGeneratePage.js"
import { generateComponent } from "./tasks/codeGenerateComponent.js"
import { generateStylesheet } from "./tasks/codeGenerateStylesheet.js"

import { generateEnvFile } from "./tasks/envGenerateFile.js"
import { syncEnvKeys } from "./tasks/envSyncKeys.js"
import { validateEnvSetup } from "./tasks/envValidateSetup.js"

import { fullSystemScan } from "./tasks/systemFullScan.js"
import { generateAllRoutes } from "./tasks/systemGenerateRoutes.js"
import { generateDashboardTemplate } from "./tasks/systemGenerateDashboardTemplate.js"

import { mapTableToUi } from "./tasks/mapTableToUi.js"
import { mapRouteToPage } from "./tasks/mapRouteToPage.js"
import { mapModuleToNav } from "./tasks/mapModuleToNav.js"

import { generateSqlTable } from "./tasks/sqlGenerateTable.js"
import { generateRlsPolicy } from "./tasks/sqlGenerateRls.js"
import { generateRelationships } from "./tasks/sqlGenerateRelationships.js"
import { scanSchema } from "./tasks/sqlScanSchema.js"

import { registerUnknownCommand } from "../utils/registerUnknownCommand.js"

export async function runBuilder(taskId, payload) {
  switch (taskId) {
    // BUILDER MODULES
    case "builder:generate_module": return await generateModule(payload)
    case "builder:generate_generic": return await generateGenericModule(payload)
    case "builder:generate_login_form": return await generateLoginForm(payload)

    // CODE GENERATORS
    case "code:generate_api_route": return await generateApiRoute(payload)
    case "code:generate_page": return await generatePage(payload)
    case "code:generate_component": return await generateComponent(payload)
    case "code:generate_stylesheet": return await generateStylesheet(payload)

    // ENV MANAGEMENT
    case "env:generate_file": return await generateEnvFile(payload)
    case "env:sync_keys": return await syncEnvKeys(payload)
    case "env:validate_setup": return await validateEnvSetup(payload)

    // SYSTEM OPERATIONS
    case "system:full_scan": return await fullSystemScan(payload)
    case "system:generate_all_routes": return await generateAllRoutes(payload)
    case "system:generate_dashboard_template": return await generateDashboardTemplate(payload)

    // SQL / SUPABASE
    case "sql:generate_table": return await generateSqlTable(payload)
    case "sql:generate_rls": return await generateRlsPolicy(payload)
    case "sql:generate_relationships": return await generateRelationships(payload)
    case "sql:scan_schema": return await scanSchema(payload)

    // MAPPINGS
    case "map:table_to_ui": return await mapTableToUi(payload)
    case "map:route_to_page": return await mapRouteToPage(payload)
    case "map:module_to_nav": return await mapModuleToNav(payload)

    // FALLBACK
    default:
      await registerUnknownCommand("builder", taskId)
      throw new Error("❌ ONBEKENDE_BUILDER_TAKEN_TYPE: " + taskId)
  }
}

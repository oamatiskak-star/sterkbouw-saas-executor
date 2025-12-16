// architect/index.js

import {
  generateFullUiLayout,
  generateSection,
  generateForm,
  generateTable
} from "./tasks/generateFullUiLayout.js"

import {
  generateSqlTable,
  generateRlsPolicy,
  generateRelationships,
  scanSchema
} from "./tasks/sqlTasks.js"

import {
  generateApiRoute,
  generatePage,
  generateComponent,
  generateStylesheet
} from "./tasks/codeTasks.js"

import {
  generateEnvFile,
  syncEnvKeys,
  validateEnvSetup
} from "./tasks/envTasks.js"

import {
  fullSystemScan,
  generateAllRoutes,
  generateDashboardTemplate
} from "./tasks/systemTasks.js"

import {
  mapTableToUi,
  mapRouteToPage,
  mapModuleToNav
} from "./tasks/mappingTasks.js"

import {
  generateModule,
  generateGenericModule
} from "../builder/moduleGenerator.js"

import { generateLoginForm } from "../builder/loginForm.js"

import { registerUnknownCommand } from "../utils/registerUnknownCommand.js"

export async function handleArchitectTask(taskId, payload) {
  switch (taskId) {
    // FRONTEND STRUCTURE
    case "frontend:full_ui_layout": return await generateFullUiLayout(payload)
    case "frontend:generate_section": return await generateSection(payload)
    case "frontend:generate_form": return await generateForm(payload)
    case "frontend:generate_table": return await generateTable(payload)

    // BUILDER COMMANDS
    case "builder:generate_module": return await generateModule(payload)
    case "builder:generate_generic": return await generateGenericModule(payload)
    case "builder:generate_login_form": return await generateLoginForm(payload)

    // SQL / SUPABASE
    case "sql:generate_table": return await generateSqlTable(payload)
    case "sql:generate_rls": return await generateRlsPolicy(payload)
    case "sql:generate_relationships": return await generateRelationships(payload)
    case "sql:scan_schema": return await scanSchema(payload)

    // FRONTEND CODE
    case "code:generate_api_route": return await generateApiRoute(payload)
    case "code:generate_page": return await generatePage(payload)
    case "code:generate_component": return await generateComponent(payload)
    case "code:generate_stylesheet": return await generateStylesheet(payload)

    // ENV FILES
    case "env:generate_file": return await generateEnvFile(payload)
    case "env:sync_keys": return await syncEnvKeys(payload)
    case "env:validate_setup": return await validateEnvSetup(payload)

    // SYSTEM
    case "system:full_scan": return await fullSystemScan(payload)
    case "system:generate_all_routes": return await generateAllRoutes(payload)
    case "system:generate_dashboard_template": return await generateDashboardTemplate(payload)

    // MAPPINGS
    case "map:table_to_ui": return await mapTableToUi(payload)
    case "map:route_to_page": return await mapRouteToPage(payload)
    case "map:module_to_nav": return await mapModuleToNav(payload)

    // UNKNOWN FALLBACK
    default:
      await registerUnknownCommand("architect", taskId)
      throw new Error("❌ ONBEKENDE_TAKEN_TYPE VOOR AO ARCHITECT: " + taskId)
  }
}

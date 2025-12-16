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
      TABLER INSTALL (ANALYSEFASE)
      ========================
      */
      case "frontend:install_tabler": {
        const m = await import("./frontend/installTabler.js")
        return await m.installTabler(payload)
      }

      /*
      ========================
      GLOBALE FRONTEND LAYOUT
      ========================
      */
      case "frontend:force_dashboard_layout": {
        const m = await import("./frontend/applyGlobalLayoutGitHub.js")
        return await m.applyGlobalLayoutGitHub(payload)
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
        return await m.

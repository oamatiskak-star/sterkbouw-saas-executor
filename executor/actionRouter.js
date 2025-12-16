// builder/index.js

/*
BUILDER
- VOERT UIT OP BASIS VAN SUPABASE TASKS
- GEEN STATISCHE IMPORTS
- ALTIJD LAZY LOAD
- MAG NOOIT CRASHEN OP ONTBREKENDE FILES
*/

export async function runBuilder(payload) {
  const { actionId } = payload

  try {
    switch (actionId) {
      case "builder:generate_module": {
        const m = await import("./moduleGenerator.js")
        return await m.runBuilder(payload)
      }

      case "builder:generate_generic": {
        const m = await import("./moduleGenerator.js")
        return await m.generateGenericModule(payload)
      }

      case "builder:generate_login_form": {
        const m = await import("./loginForm.js")
        return await m.generateLoginForm(payload)
      }

      case "frontend:full_ui_layout": {
        const m = await import("./fullUiLayout.js")
        return await m.buildFullUiLayout(payload)
      }

      case "builder:write_file": {
        const m = await import("./fileWriter.js")
        return await m.writeFile(payload)
      }

      case "builder:write_multiple": {
        const m = await import("./fileWriter.js")
        return await m.writeMultipleFiles(payload)
      }

      case "builder:generate_crud_form": {
        const m = await import("./uiPresets.js")
        return await m.generateCrudForm(payload)
      }

      case "builder:generate_dashboard": {
        const m = await import("./uiPresets.js")
        return await m.generateDashboard(payload)
      }

      case "builder:generate_settings_page": {
        const m = await import("./uiPresets.js")
        return await m.generateSettingsPage(payload)
      }

      case "builder:write_env_file": {
        const m = await import("./envWriter.js")
        return await m.writeEnvFile(payload)
      }

      case "builder:update_env_var": {
        const m = await import("./envWriter.js")
        return await m.updateEnvVar(payload)
      }

      case "builder:scan_project": {
        const m = await import("./scanner.js")
        return await m.scanProject(payload)
      }

      case "builder:map_existing": {
        const m = await import("./scanner.js")
        return await m.mapExistingModule(payload)
      }

      case "builder:generate_css": {
        const m = await import("./styleGenerator.js")
        return await m.generateCSS(payload)
      }

      case "builder:update_global_css": {
        const m = await import("./styleGenerator.js")
        return await m.updateGlobalCSS(payload)
      }

      case "builder:test_task":
        return {
          status: "ok",
          message: "Test uitgevoerd",
          payload
        }

      case "builder:log_payload":
        console.log("BUILDER PAYLOAD:", payload)
        return {
          status: "ok",
          message: "Payload gelogd"
        }

      default:
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

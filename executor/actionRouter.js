// builder/index.js

export async function runBuilder(payload) {
  const { actionId } = payload

  switch (actionId) {
    case "builder:generate_module":
      return await import("./moduleGenerator.js").then(m => m.runBuilder(payload))

    case "builder:generate_generic":
      return await import("./moduleGenerator.js").then(m => m.generateGenericModule(payload))

    case "builder:generate_login_form":
      return await import("./loginForm.js").then(m => m.generateLoginForm(payload))

    case "frontend:full_ui_layout":
      return await import("./fullUiLayout.js").then(m => m.buildFullUiLayout(payload))

    case "builder:write_file":
      return await import("./fileWriter.js").then(m => m.writeFile(payload))

    case "builder:write_multiple":
      return await import("./fileWriter.js").then(m => m.writeMultipleFiles(payload))

    case "builder:generate_crud_form":
      return await import("./uiPresets.js").then(m => m.generateCrudForm(payload))

    case "builder:generate_dashboard":
      return await import("./uiPresets.js").then(m => m.generateDashboard(payload))

    case "builder:generate_settings_page":
      return await import("./uiPresets.js").then(m => m.generateSettingsPage(payload))

    case "builder:write_env_file":
      return await import("./envWriter.js").then(m => m.writeEnvFile(payload))

    case "builder:update_env_var":
      return await import("./envWriter.js").then(m => m.updateEnvVar(payload))

    case "builder:scan_project":
      return await import("./scanner.js").then(m => m.scanProject(payload))

    case "builder:map_existing":
      return await import("./scanner.js").then(m => m.mapExistingModule(payload))

    case "builder:generate_css":
      return await import("./styleGenerator.js").then(m => m.generateCSS(payload))

    case "builder:update_global_css":
      return await import("./styleGenerator.js").then(m => m.updateGlobalCSS(payload))

    case "builder:test_task":
      return { status: "ok", message: "Test uitgevoerd", payload }

    case "builder:log_payload":
      console.log("Payload ontvangen:", payload)
      return { status: "ok", message: "Payload gelogd" }

    default:
      throw new Error("ONBEKENDE_BUILDER_ACTION")
  }
}

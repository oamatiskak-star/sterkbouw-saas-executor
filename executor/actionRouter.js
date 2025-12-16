import { runBuilder } from "../builder/index.js"
import { buildFullUiLayout } from "../builder/fullUiLayout.js"
import { generateLoginForm } from "../builder/loginForm.js"
import { generateModule } from "../builder/genericModule.js"

export async function runAction(actionId, payload) {
  /*
  ========================
  BUILDER MODULE GENERATOR
  ========================
  */
  if (actionId === "builder:generate_module") {
    return await runBuilder(payload)
  }

  if (actionId === "builder:generate_login_form") {
    return await generateLoginForm(payload)
  }

  if (actionId === "builder:generate_generic") {
    return await generateModule(payload)
  }

  /*
  ========================
  FRONTEND UI BUILDER
  ========================
  */
  if (actionId === "frontend:full_ui_layout") {
    return await buildFullUiLayout(payload)
  }

  /*
  ========================
  ONBEKENDE ACTION
  ========================
  */
  throw new Error("ONBEKENDE_ACTION")
}

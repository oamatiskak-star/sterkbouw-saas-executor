import { runBuilder } from "../builder/index.js"
import { buildFullUiLayout } from "../builder/fullUiLayout.js"
import { generateLoginForm } from "../builder/loginForm.js"
import { generateGenericModule } from "../builder/moduleGenerator.js" // <-- dit is de juiste naam

export async function runAction(actionId, payload) {
  if (actionId === "builder:generate_module") {
    return await runBuilder(payload)
  }

  if (actionId === "builder:generate_login_form") {
    return await generateLoginForm(payload)
  }

  if (actionId === "builder:generate_generic") {
    return await generateGenericModule(payload) // <-- ook naam aangepast
  }

  if (actionId === "frontend:full_ui_layout") {
    return await buildFullUiLayout(payload)
  }

  throw new Error("ONBEKENDE_ACTION")
}

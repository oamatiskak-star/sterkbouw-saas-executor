import { runBuilder } from "../builder/index.js"
import { buildFullUiLayout } from "../builder/fullUiLayout.js"

export async function runAction(actionId, payload) {
  /*
  ========================
  BUILDER MODULE GENERATOR
  ========================
  */
  if (actionId === "builder:generate_module") {
    return await runBuilder(payload)
  }

  /*
  ========================
  FRONTEND UI BUILDER
  ========================
  */
  if (actionId === "frontend:full_ui_layout") {
    return await buildFullUiLayout()
  }

  /*
  ========================
  ONBEKENDE ACTION
  ========================
  */
  throw new Error("ONBEKENDE_ACTION")
}

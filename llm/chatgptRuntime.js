import { resolveIntent } from "./intentResolver.js"
import { generatePlan } from "./planGenerator.js"
import { formatResponse } from "./responseFormatter.js"

export function runDialogue(text) {
  const intent = resolveIntent(text)
  const plan = generatePlan(intent)
  return formatResponse("Ik begrijp je opdracht.", plan)
}

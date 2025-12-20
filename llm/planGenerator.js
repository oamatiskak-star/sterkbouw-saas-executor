export function generatePlan(intent) {
  if (intent === "calculation") {
    return [
      "Documenten scannen",
      "Fundering check",
      "NEN meting",
      "STABU structuur",
      "2jours calculatie"
    ]
  }
  return ["Systeemverificatie"]
}

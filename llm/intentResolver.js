export function resolveIntent(text) {
  if (text.toLowerCase().includes("calculatie")) return "calculation"
  if (text.toLowerCase().includes("frontend")) return "frontend"
  return "general"
}

export function formatResponse(summary, plan) {
  return `${summary}\n\nVoorstel:\n${plan.map((p,i)=>`${i+1}. ${p}`).join("\n")}\n\nBevestig?`
}

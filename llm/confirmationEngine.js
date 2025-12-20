export function needsConfirmation(text) {
  return !text.toLowerCase().includes("bevestig")
}

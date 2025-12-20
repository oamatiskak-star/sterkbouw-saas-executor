export function extractTelegramMessage(req) {
  return req.body?.message || null
}

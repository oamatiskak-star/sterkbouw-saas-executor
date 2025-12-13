import fetch from "node-fetch"

export async function healthSterkbouw({ log }) {
  log("[AO][HEALTH] Start health checks")

  const targets = [
    process.env.BACKEND_URL + "/health",
    process.env.FRONTEND_URL + "/api/health"
  ]

  for (const url of targets) {
    try {
      const res = await fetch(url)
      log(`[AO][HEALTH] ${url} -> ${res.status}`)
    } catch (e) {
      log(`[AO][HEALTH][FAIL] ${url}`)
    }
  }

  log("[AO][HEALTH] Klaar")
}

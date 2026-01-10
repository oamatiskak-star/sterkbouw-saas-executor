import "dotenv/config"

console.log("SterkCalc Executor gestart")
console.log("Status: idle")

const missing = []
if (!process.env.SUPABASE_URL) missing.push("SUPABASE_URL")
if (!process.env.SUPABASE_SERVICE_ROLE_KEY) missing.push("SUPABASE_SERVICE_ROLE_KEY")

if (missing.length > 0) {
  console.error(`Missing environment variables: ${missing.join(", ")}`)
}

process.on("SIGTERM", () => {
  console.log("Shutdown signal received (SIGTERM)")
  process.exit(0)
})

process.on("SIGINT", () => {
  console.log("Shutdown signal received (SIGINT)")
  process.exit(0)
})

await new Promise(() => {})

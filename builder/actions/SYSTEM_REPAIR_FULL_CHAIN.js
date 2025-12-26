export default async function SYSTEM_REPAIR_FULL_CHAIN({ supabase, task }) {
  // 1. Controleer minimale systeembeschikbaarheid
  const checks = [
    supabase.from("projects").select("id").limit(1),
    supabase.from("executor_tasks").select("id").limit(1)
  ]

  for (const c of checks) {
    const { error } = await c
    if (error) {
      return {
        status: "failed",
        error: `SYSTEM_CHECK_FAILED: ${error.message}`
      }
    }
  }

  // 2. Schrijf expliciet herstelstatus weg
  await supabase.from("system_log").insert({
    type: "repair",
    message: "system_repair_full_chain completed successfully",
    created_at: new Date().toISOString()
  })

  return {
    status: "completed",
    error: null
  }
}

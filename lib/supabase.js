import { createClient } from "@supabase/supabase-js"

const supabaseUrl = process.env.SUPABASE_URL
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!supabaseUrl || !serviceRoleKey) {
  throw new Error("EXECUTOR_SUPABASE_ENV_MISSING")
}

const supabase = createClient(supabaseUrl, serviceRoleKey, {
  auth: {
    persistSession: false,
    autoRefreshToken: false
  }
})

// HARD LOCK: herkenbaar object
Object.defineProperty(supabase, "__EXECUTOR_SINGLETON__", {
  value: true,
  writable: false
})

export default supabase

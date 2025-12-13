import { createClient } from "@supabase/supabase-js"

const supabaseUrl = process.env.SUPABASE_URL
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!supabaseUrl || !supabaseKey) {
  throw new Error("SUPABASE_URL of SUPABASE_SERVICE_ROLE_KEY ontbreekt")
}

export const supabase = createClient(
  supabaseUrl,
  supabaseKey
)

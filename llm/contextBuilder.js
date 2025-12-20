import { createClient } from "@supabase/supabase-js"

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
)

export async function buildContext(sessionId) {
  const { data } = await supabase
    .from("chat_messages")
    .select("role,content")
    .eq("session_id", sessionId)
    .order("created_at", { ascending: true })

  return data || []
}

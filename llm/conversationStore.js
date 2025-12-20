import { createClient } from "@supabase/supabase-js"

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
)

export async function storeMessage(sessionId, role, content) {
  await supabase.from("chat_messages").insert({
    session_id: sessionId,
    role,
    content
  })
}

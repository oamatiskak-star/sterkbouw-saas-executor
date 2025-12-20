import { createClient } from "@supabase/supabase-js"

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
)

export async function getOrCreateSession(chatId) {
  const { data } = await supabase
    .from("chat_sessions")
    .select("*")
    .eq("chat_id", chatId)
    .maybeSingle()

  if (data) return data

  const { data: created } = await supabase
    .from("chat_sessions")
    .insert({ chat_id: chatId })
    .select()
    .single()

  return created
}

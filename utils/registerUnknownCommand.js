// utils/registerUnknownCommand.js

import { createClient } from "@supabase/supabase-js"

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
)

export async function registerUnknownCommand(source, command) {
  const { error } = await supabase.from("unknown_commands").insert([
    {
      source: source, // bijvoorbeeld "builder" of "architect"
      command: command,
      detected_at: new Date().toISOString()
    }
  ])

  if (error) {
    console.error("❌ Fout bij loggen van onbekend commando:", error)
  } else {
    console.log(`🟡 Onbekend commando gelogd: ${source}:${command}`)
  }
}

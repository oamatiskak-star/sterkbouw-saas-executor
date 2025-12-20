import { createClient } from "@supabase/supabase-js"

/*
====================================================
UNKNOWN COMMAND REGISTRATIE – DEFINITIEF
- MAG NOOIT EXECUTOR STOPPEN
- MAG NOOIT THROWEN
- LOGT ALLEEN ALS TABEL BESTAAT
====================================================
*/

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
)

export async function registerUnknownCommand(source, command) {
  if (!source || !command) return

  try {
    const { error } = await supabase.from("unknown_commands").insert({
      source,
      command,
      detected_at: new Date().toISOString()
    })

    if (error) {
      console.warn(
        "[AO][UNKNOWN_COMMAND] niet gelogd",
        source,
        command,
        error.message
      )
    } else {
      console.log(
        "[AO][UNKNOWN_COMMAND]",
        source,
        command
      )
    }
  } catch (err) {
    // ❗ NOOIT crashen
    console.warn(
      "[AO][UNKNOWN_COMMAND][SKIPPED]",
      source,
      command,
      err.message
    )
  }
}

import { createClient } from "@supabase/supabase-js"
import fs from "fs"
import path from "path"
import { SYSTEM_REGISTRY } from "../system/systemRegistry.js"

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
)

export async function scanSystem() {
  const snapshot = {
    timestamp: Date.now(),
    supabase: {},
    backend: {},
    frontend: {}
  }

  // Supabase tables
  const { data: tables } = await supabase.rpc("list_tables")
  snapshot.supabase.tables = tables?.map(t => t.name) || []

  // Backend files
  snapshot.backend.files = fs.readdirSync("./backend", { recursive: true })

  // Frontend pages
  snapshot.frontend.pages = fs.readdirSync("./frontend/pages", { recursive: true })

  await supabase.from("system_snapshots").insert(snapshot)

  return snapshot
}

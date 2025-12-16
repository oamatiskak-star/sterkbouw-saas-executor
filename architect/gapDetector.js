import { SYSTEM_REGISTRY } from "../system/systemRegistry.js"

export function detectGaps(snapshot) {
  const gaps = []

  for (const table of SYSTEM_REGISTRY.supabase.requiredTables) {
    if (!snapshot.supabase.tables.includes(table)) {
      gaps.push({ type: "CREATE_TABLE", name: table })
    }
  }

  for (const page of SYSTEM_REGISTRY.frontend.requiredPages) {
    if (!snapshot.frontend.pages.includes(page)) {
      gaps.push({ type: "CREATE_FRONTEND_PAGE", path: page })
    }
  }

  return gaps
}

import fs from "fs"
import path from "path"
import { createClient } from "@supabase/supabase-js"

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
)

export async function syncNavigation() {
  const { data, error } = await supabase
    .from("ui_navigation")
    .select("*")
    .eq("is_active", true)

  if (error) {
    throw new Error("NAV_LOAD_FAILED")
  }

  const pagesRoot = path.join(process.cwd(), "pages")
  const missing = []

  for (const item of data) {
    const routeFile =
      item.route === "/"
        ? "index.js"
        : item.route.replace("/", "") + ".js"

    const fullPath = path.join(pagesRoot, routeFile)

    if (!fs.existsSync(fullPath)) {
      missing.push(routeFile)
    }
  }

  if (missing.length > 0) {
    throw new Error("ONTBREKENDE_PAGINAS: " + missing.join(", "))
  }

  return {
    status: "ok",
    validated_routes: data.length
  }
}

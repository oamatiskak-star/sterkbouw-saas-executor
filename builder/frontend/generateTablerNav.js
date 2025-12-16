import fs from "fs"
import path from "path"
import { createClient } from "@supabase/supabase-js"

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
)

export async function generateTablerNav() {
  const { data: nav } = await supabase.from("navigation").select("*")

  const items = nav.map(
    m => `<a className="nav-link" href="${m.route}">${m.label}</a>`
  ).join("\n")

  const content = `
export default function TablerNav() {
  return (
    <div className="navbar-nav">
      ${items}
    </div>
  )
}
`

  fs.writeFileSync(
    path.join(process.cwd(), "components/TablerNav.js"),
    content.trim(),
    "utf8"
  )

  return { status: "ok", items: nav.length }
}

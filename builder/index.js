// builder/index.js
import fs from "fs"
import path from "path"
import { fileURLToPath } from "url"

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

export async function runBuilder(payload) {
  const action = payload?.action || ""
  const moduleKey = payload?.moduleKey || "frontend:default"
  const design = payload?.design || {}

  if (action === "write_file") {
    const filePath = payload.path
    const content = payload.content || ""

    if (!filePath) throw new Error("Bestandspad ontbreekt in payload")

    const fullPath = path.join(process.cwd(), filePath)
    const dir = path.dirname(fullPath)

    fs.mkdirSync(dir, { recursive: true })
    fs.writeFileSync(fullPath, content.trim())

    console.log(`✅ Bestand geschreven: ${filePath}`)
    return { status: "ok", file: filePath }
  }

  if (action === "generate_module") {
    const [domain, name] = moduleKey.split(":")
    const base = process.cwd()
    const apiPath = path.join(base, "backend/api", domain)
    const pagePath = path.join(base, "frontend/pages", domain)
    const tableName = design.tables?.[0] || `${name}_data`

    fs.mkdirSync(apiPath, { recursive: true })
    fs.mkdirSync(pagePath, { recursive: true })
    fs.mkdirSync(path.join(base, "supabase"), { recursive: true })

    fs.writeFileSync(
      path.join(apiPath, `${name}.js`),
      `
export default function handler(req, res) {
  res.json({ module: "${moduleKey}", status: "ok" })
}
`.trim()
    )

    fs.writeFileSync(
      path.join(pagePath, `${name}.js`),
      `
export default function Page() {
  return (
    <div style={{ padding: "24px" }}>
      <h1 style={{ fontSize: "24px", marginBottom: "16px" }}>${name}</h1>
      <p>Module gegenereerd en klaar voor gebruik.</p>
    </div>
  )
}
`.trim()
    )

    fs.writeFileSync(
      path.join(base, "supabase", `${tableName}.sql`),
      `
create table if not exists ${tableName} (
  id uuid primary key default gen_random_uuid(),
  project_id uuid,
  data jsonb,
  created_at timestamptz default now()
);
`.trim()
    )

    console.log(`✅ Module "${moduleKey}" gegenereerd met tabel "${tableName}"`)
    return { status: "ok", module: moduleKey }
  }

  throw new Error("Onbekende builder actie")
}

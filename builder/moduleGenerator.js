// builder/moduleGenerator.js
import fs from "fs"
import path from "path"

export async function generateGenericModule(payload) {
  const base = process.cwd()
  const moduleKey = payload.moduleKey || "frontend:default"
  const design = payload.design || {}
  const [domain, name] = moduleKey.split(":")
  const apiPath = path.join(base, "backend/api", domain)
  const pagePath = path.join(base, "frontend/pages", domain)
  const tableName = design.tables?.[0] || `${name}_data`

  fs.mkdirSync(apiPath, { recursive: true })
  fs.mkdirSync(pagePath, { recursive: true })

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

  fs.mkdirSync(path.join(base, "supabase"), { recursive: true })

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
}

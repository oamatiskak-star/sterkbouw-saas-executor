import fs from "fs"
import path from "path"

export async function generateModule(moduleKey, design) {
  const base = process.cwd()

  const [domain, name] = moduleKey.split(":")

  const apiPath = path.join(base, "backend/api", domain)
  const pagePath = path.join(base, "frontend/pages", domain)
  const tableName = design.tables[0]

  fs.mkdirSync(apiPath, { recursive: true })
  fs.mkdirSync(pagePath, { recursive: true })

  // API route
  fs.writeFileSync(
    path.join(apiPath, `${name}.js`),
    `
export default function handler(req, res) {
  res.json({ module: "${moduleKey}", status: "ok" })
}
`
  )

  // Frontend page
  fs.writeFileSync(
    path.join(pagePath, `${name}.js`),
    `
export default function Page() {
  return (
    <div>
      <h1>${moduleKey}</h1>
      <p>Module gegenereerd</p>
    </div>
  )
}
`
  )

  // SQL schema
  fs.writeFileSync(
    path.join(base, "supabase", `${tableName}.sql`),
    `
create table if not exists ${tableName} (
  id uuid primary key default gen_random_uuid(),
  project_id uuid,
  data jsonb,
  created_at timestamptz default now()
);
`
  )
}

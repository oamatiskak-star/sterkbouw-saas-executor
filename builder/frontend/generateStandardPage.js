import fs from "fs"
import path from "path"
import { createClient } from "@supabase/supabase-js"

const FRONTEND_ROOT = "/tmp/frontend"

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
)

function ensureDir(dir) {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true })
  }
}

export async function generateStandardPage(payload = {}) {
  const { route, title = "Pagina" } = payload
  if (!route) throw new Error("ROUTE_ONTBREEKT")

  const clean =
    route === "/" ? "index" : route.replace(/^\//, "").replace(/\/$/, "")

  const filePath = path.join(FRONTEND_ROOT, "pages", `${clean}.js`)
  ensureDir(path.dirname(filePath))

  const { data: actions } = await supabase
    .from("page_actions")
    .select("label, action, target")
    .eq("route", route)

  const buttons = (actions || [])
    .map(
      a => `
        <button
          className="btn btn-primary me-2"
          onClick={() => window.location.href='${a.target}'}
        >
          ${a.label}
        </button>
      `
    )
    .join("\n")

  const content = `
export default function Page() {
  return (
    <div>
      <h1>${title}</h1>

      <div style={{ display: "flex", gap: 12, marginBottom: 24 }}>
        ${buttons || "<span />"}
      </div>

      <div className="row row-cards">
        <div className="col-md-3">
          <div className="card"><div className="card-body">KPI 1</div></div>
        </div>
        <div className="col-md-3">
          <div className="card"><div className="card-body">KPI 2</div></div>
        </div>
        <div className="col-md-3">
          <div className="card"><div className="card-body">KPI 3</div></div>
        </div>
        <div className="col-md-3">
          <div className="card"><div className="card-body">KPI 4</div></div>
        </div>
      </div>
    </div>
  )
}
`.trim()

  fs.writeFileSync(filePath, content)
  console.log("FRONTEND STANDARD PAGE WRITTEN:", filePath)

  return { status: "done", file: filePath }
}

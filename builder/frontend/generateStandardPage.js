import fs from "fs"
import path from "path"

const FRONTEND_ROOT = "/tmp/frontend"

function ensureDir(dir) {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true })
  }
}

export async function generateStandardPage(payload = {}) {
  const {
    route,
    title,
    subtitle,
    kpis = [],
    actions = []
  } = payload

  if (!route) {
    throw new Error("ROUTE_ONTBREEKT")
  }

  const clean =
    route === "/"
      ? "index"
      : route.replace(/^\//, "").replace(/\/$/, "")

  const filePath = path.join(
    FRONTEND_ROOT,
    "pages",
    `${clean}.js`
  )

  ensureDir(path.dirname(filePath))

  const kpiBlocks = kpis.map((kpi, i) => `
    <div className="card">
      <div className="card-body">
        <div className="subheader">${kpi.label}</div>
        <div className="h1">${kpi.value ?? "-"}</div>
      </div>
    </div>
  `).join("")

  const actionCards = actions.map(action => `
    <div className="col-md-4">
      <div className="card h-100">
        <div className="card-body">
          <h3 className="card-title">${action.label}</h3>
          <p className="text-muted">${action.description ?? ""}</p>
          <a href="${action.route}" className="btn btn-primary mt-3">
            Openen
          </a>
        </div>
      </div>
    </div>
  `).join("")

  const content = `
export default function Page() {
  return (
    <div className="page-body">
      <div className="container-xl">

        <div className="mb-4">
          <h1 className="page-title">${title}</h1>
          <div className="text-muted">${subtitle ?? ""}</div>
        </div>

        <div className="row row-cards mb-4">
          ${kpiBlocks}
        </div>

        <div className="row row-cards">
          ${actionCards}
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

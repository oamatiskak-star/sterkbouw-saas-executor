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

  const kpiBlocks = kpis.map(kpi => `
        <div className="card">
          <div className="card-body">
            <div className="subheader">${kpi.label}</div>
            <div className="h1">${kpi.value}</div>
          </div>
        </div>
  `).join("")

  const actionBlocks = actions.map(action => `
        <div className="col-md-3">
          <div className="card card-link">
            <div className="card-body">
              <h3 className="card-title">${action.label}</h3>
              <a href="${action.route}" className="btn btn-primary w-100">
                Open
              </a>
            </div>
          </div>
        </div>
  `).join("")

  const content = `
import Head from "next/head"

export default function Page() {
  return (
    <>
      <Head>
        <title>${title}</title>
      </Head>

      <div className="page-wrapper">
        <div className="page-body">
          <div className="container-xl">

            <h1 className="mb-4">${title}</h1>

            <div className="row row-cards mb-4">
              ${kpiBlocks || "<p>Geen KPI’s</p>"}
            </div>

            <div className="row row-cards">
              ${actionBlocks || "<p>Geen acties</p>"}
            </div>

          </div>
        </div>
      </div>
    </>
  )
}
`.trim()

  fs.writeFileSync(filePath, content)
  console.log("FRONTEND STANDARD PAGE WRITTEN:", filePath)

  return { status: "done", file: filePath }
}

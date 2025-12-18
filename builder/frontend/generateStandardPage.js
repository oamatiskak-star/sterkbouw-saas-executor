import fs from "fs"
import path from "path"
import Link from "next/link"

const FRONTEND_ROOT = "/tmp/frontend"

function ensureDir(dir) {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true })
  }
}

export async function generateStandardPage(payload = {}) {
  const {
    route,
    title = "Pagina",
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

  const kpiBlocks = kpis.length
    ? kpis.map(kpi => `
      <div className="col-md-3">
        <div className="card">
          <div className="card-body">
            <div className="subheader">${kpi.label}</div>
            <div className="h1">${kpi.value}</div>
          </div>
        </div>
      </div>
    `).join("")
    : `<div className="col-12"><p>Geen KPI’s</p></div>`

  const actionBlocks = actions.length
    ? actions.map(action => `
      <div className="col-md-3">
        <a href="${action.route}" className="card card-link">
          <div className="card-body text-center">
            <h3 className="card-title">${action.label}</h3>
            <div className="btn btn-primary mt-2 w-100">
              Open
            </div>
          </div>
        </a>
      </div>
    `).join("")
    : `<div className="col-12"><p>Geen acties</p></div>`

  const content = `
import Head from "next/head"

export default function Page() {
  return (
    <>
      <Head>
        <title>${title}</title>
      </Head>

      <div className="page-body">
        <div className="container-xl">

          <h1 className="mb-4">${title}</h1>

          <div className="row row-cards mb-4">
            ${kpiBlocks}
          </div>

          <div className="row row-cards">
            ${actionBlocks}
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

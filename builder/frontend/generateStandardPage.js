import fs from "fs"
import path from "path"
import { execSync } from "child_process"

const FRONTEND_ROOT = "/tmp/frontend"
const FRONTEND_REPO =
  "https://x-access-token:" +
  process.env.GITHUB_TOKEN +
  "@github.com/oamatiskak-star/sterkbouw-saas-front.git"

function ensureDir(dir) {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true })
  }
}

function ensureFrontendRepo() {
  if (!process.env.GITHUB_TOKEN) {
    throw new Error("GITHUB_TOKEN_ONTBREEKT")
  }

  if (!fs.existsSync(path.join(FRONTEND_ROOT, ".git"))) {
    console.log("FRONTEND REPO CLONE (generateStandardPage)")
    execSync(`git clone ${FRONTEND_REPO} ${FRONTEND_ROOT}`, {
      stdio: "inherit"
    })
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

  // 1. ZORG DAT FRONTEND REPO BESTAAT
  ensureFrontendRepo()

  // 2. ROUTE OPSCHONEN
  const clean =
    route === "/" ? "index" : route.replace(/^\//, "").replace(/\/$/, "")

  // 3. TARGET PAD (ALTIJD index.js)
  const filePath =
    clean === "index"
      ? path.join(FRONTEND_ROOT, "pages", "index.js")
      : path.join(FRONTEND_ROOT, "pages", clean, "index.js")

  // 4. MAPSTRUCTUUR AANMAKEN
  ensureDir(path.dirname(filePath))

  // 5. KPI BLOKKEN
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

  // 6. ACTIE BLOKKEN
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

  // 7. PAGINA CONTENT
  const content = `
export default function Page() {
  return (
    <>
      <h1 className="mb-4">${title}</h1>

      <div className="row row-cards mb-4">
        ${kpiBlocks}
      </div>

      <div className="row row-cards">
        ${actionBlocks}
      </div>
    </>
  )
}
`.trim()

  // 8. SCHRIJF BESTAND
  fs.writeFileSync(filePath, content, "utf8")

  console.log("FRONTEND STANDARD PAGE WRITTEN:", filePath)

  return {
    status: "done",
    file: filePath
  }
}

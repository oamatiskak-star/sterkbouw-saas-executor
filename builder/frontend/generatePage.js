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
    console.log("FRONTEND REPO CLONE (generatePage)")
    execSync(`git clone ${FRONTEND_REPO} ${FRONTEND_ROOT}`, {
      stdio: "inherit"
    })
  }
}

export async function generatePage(payload = {}) {
  const { route, title = "Pagina" } = payload

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

  // 5. PAGINA CONTENT
  const content = `
export default function Page() {
  return (
    <div className="page">
      <h1>${title}</h1>
      <p>Automatisch gegenereerde pagina</p>
    </div>
  )
}
`.trim()

  // 6. SCHRIJF BESTAND
  fs.writeFileSync(filePath, content)

  console.log("FRONTEND PAGE WRITTEN:", filePath)

  return {
    status: "done",
    file: filePath
  }
}

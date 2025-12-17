import fs from "fs"
import path from "path"

const FRONTEND_ROOT = "/app/frontend"

function ensureDir(dir) {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true })
  }
}

export async function generatePage(payload = {}) {
  const { route, title = "Pagina" } = payload

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

  fs.writeFileSync(filePath, content)
  console.log("FRONTEND PAGE WRITTEN:", filePath)

  return { status: "done", file: filePath }
}

import fs from "fs"
import path from "path"

const FRONTEND_ROOT = "/tmp/frontend"

export async function generateStandardPage(payload = {}) {
  const { route, title, actions = [] } = payload

  const clean = route.replace(/^\//, "")
  const filePath = path.join(FRONTEND_ROOT, "pages", `${clean}.js`)

  fs.mkdirSync(path.dirname(filePath), { recursive: true })

  const buttons = actions.map(a => `
    <a href="${a.route}" className="btn btn-primary me-2 mb-2">
      ${a.label}
    </a>
  `).join("")

  const content = `
export default function Page() {
  return (
    <div>
      <h1>${title}</h1>

      <div className="row my-4">
        <div className="col"><div className="card"><div className="card-body">KPI 1</div></div></div>
        <div className="col"><div className="card"><div className="card-body">KPI 2</div></div></div>
        <div className="col"><div className="card"><div className="card-body">KPI 3</div></div></div>
        <div className="col"><div className="card"><div className="card-body">KPI 4</div></div></div>
      </div>

      <div className="mt-4">
        ${buttons}
      </div>
    </div>
  )
}
`.trim()

  fs.writeFileSync(filePath, content)
  return { status: "done", file: filePath }
}

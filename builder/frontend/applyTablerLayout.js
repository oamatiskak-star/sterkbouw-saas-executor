import fs from "fs"
import path from "path"

export async function applyTablerLayout() {
  const root = process.cwd()

  const content = `
import TablerNav from "./TablerNav"

export default function TablerLayout({ children }) {
  return (
    <div className="page">
      <aside className="navbar navbar-vertical">
        <div className="container-fluid">
          <h1 className="navbar-brand">SterkBouw</h1>
          <TablerNav />
        </div>
      </aside>

      <div className="page-wrapper">
        <div className="page-body">
          <div className="container-xl">
            {children}
          </div>
        </div>
      </div>
    </div>
  )
}
`
  fs.writeFileSync(
    path.join(root, "components", "TablerLayout.js"),
    content.trim(),
    "utf8"
  )

  return { status: "ok" }
}

import fs from "fs"
import path from "path"

export async function applyTablerLayout() {
  const root = process.cwd()

  const files = [
    {
      target: "components/TablerLayout.js",
      content: `
import TablerNav from "./TablerNav"

export default function TablerLayout({ children }) {
  return (
    <div className="page">
      <aside className="navbar navbar-vertical navbar-expand-lg">
        <div className="container-fluid">
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
    },
    {
      target: "components/Layout.js",
      content: `
import TablerLayout from "./TablerLayout"

export default function Layout({ children }) {
  return <TablerLayout>{children}</TablerLayout>
}
`
    }
  ]

  for (const file of files) {
    const fullPath = path.join(root, file.target)
    fs.mkdirSync(path.dirname(fullPath), { recursive: true })
    fs.writeFileSync(fullPath, file.content, "utf8")
  }

  return {
    status: "ok",
    applied: files.map(f => f.target)
  }
}

import fs from "fs"
import path from "path"

export async function applyTablerLayout() {
  const root = process.cwd()

  fs.mkdirSync(path.join(root, "components"), { recursive: true })

  fs.writeFileSync(
    path.join(root, "components/TablerLayout.js"),
    `
import TablerNav from "./TablerNav"

export default function TablerLayout({ children }) {
  return (
    <div className="page">
      <TablerNav />
      <div className="page-wrapper">
        {children}
      </div>
    </div>
  )
}
`
  )

  fs.writeFileSync(
    path.join(root, "components/TablerNav.js"),
    `
import Link from "next/link"

export default function TablerNav() {
  return (
    <aside className="navbar">
      <Link href="/dashboard">Dashboard</Link>
      <Link href="/calculaties">Calculaties</Link>
      <Link href="/projecten">Projecten</Link>
    </aside>
  )
}
`
  )

  return { status: "ok" }
}

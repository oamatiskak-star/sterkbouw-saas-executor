import fs from "fs"
import path from "path"

/*
APPLY GLOBAL DASHBOARD LAYOUT
- WORDT AANGEROEPEN VIA frontend:force_dashboard_layout
- OVERSCHRIJFT FRONTEND LAYOUT-BESTANDEN
- GELDT VOOR ALLE PAGINA’S
- SCHRIJFT EXPLICIET NAAR FRONTEND ROOT
*/

export async function applyGlobalLayout(payload = {}) {
  try {
    const root = process.env.FRONTEND_ROOT

    if (!root) {
      throw new Error("FRONTEND_ROOT environment variable ontbreekt")
    }

    const files = [
      {
        target: "pages/_app.js",
        content: APP_JS
      },
      {
        target: "components/Layout.js",
        content: LAYOUT_JS
      },
      {
        target: "components/DashboardLayout.js",
        content: DASHBOARD_LAYOUT_JS
      }
    ]

    for (const file of files) {
      const fullPath = path.join(root, file.target)

      // Zorg dat map bestaat
      fs.mkdirSync(path.dirname(fullPath), { recursive: true })

      // Schrijf bestand
      fs.writeFileSync(fullPath, file.content, "utf8")
    }

    return {
      status: "ok",
      action: "frontend:force_dashboard_layout",
      frontend_root: root,
      written_files: files.map(f => f.target)
    }

  } catch (err) {
    return {
      status: "error",
      action: "frontend:force_dashboard_layout",
      error: err.message
    }
  }
}

/*
========================
_app.js
========================
*/
const APP_JS = `
import Layout from "../components/Layout"

export default function App({ Component, pageProps }) {
  return (
    <Layout>
      <Component {...pageProps} />
    </Layout>
  )
}
`

/*
========================
Layout.js
========================
*/
const LAYOUT_JS = `
import DashboardLayout from "./DashboardLayout"

export default function Layout({ children }) {
  return (
    <DashboardLayout>
      {children}
    </DashboardLayout>
  )
}
`

/*
========================
DashboardLayout.js
========================
*/
const DASHBOARD_LAYOUT_JS = `
import Link from "next/link"

export default function DashboardLayout({ children }) {
  return (
    <div className="sb-app-shell">
      <aside className="sb-sidebar">
        <div className="sb-logo">
          SterkBouw SaaS
        </div>

        <nav className="sb-nav">
          <Link href="/dashboard">Dashboard</Link>
          <Link href="/calculaties">Calculaties</Link>
          <Link href="/projecten">Projecten</Link>
          <Link href="/bim">BIM Architectuur</Link>
          <Link href="/risicoanalyse">Risico Analyse</Link>
          <Link href="/notificaties">Notificaties</Link>
          <Link href="/team">Teambeheer</Link>
        </nav>
      </aside>

      <main className="sb-content">
        {children}
      </main>
    </div>
  )
}
`

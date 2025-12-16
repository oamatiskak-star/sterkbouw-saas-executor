import fs from "fs"
import path from "path"
import { execSync } from "child_process"

/*
FRONTEND: INSTALL TABLER (NEXT.JS – PAGES ROUTER)
- SQL-first aangestuurd
- alleen uitvoeren na deploy gate
- geen partials
- geen interactie
- veilig overschrijven
*/

export async function installTabler(payload = {}) {
  try {
    const root = process.cwd()

    const frontendRoot =
      process.env.FRONTEND_ROOT ||
      process.env.FRONTEND_PATH ||
      root

    const packageJsonPath = path.join(frontendRoot, "package.json")
    if (!fs.existsSync(packageJsonPath)) {
      throw new Error("package.json niet gevonden in frontend root")
    }

    /*
    ========================
    DEPENDENCIES
    ========================
    */
    execSync(
      "npm install @tabler/core @tabler/icons-react bootstrap",
      {
        cwd: frontendRoot,
        stdio: "inherit"
      }
    )

    /*
    ========================
    GLOBAL CSS
    ========================
    */
    const stylesDir = path.join(frontendRoot, "styles")
    fs.mkdirSync(stylesDir, { recursive: true })

    const globalCssPath = path.join(stylesDir, "globals.css")

    const GLOBAL_CSS = `
@import "@tabler/core/dist/css/tabler.min.css";
@import "@tabler/core/dist/css/tabler-flags.min.css";
@import "@tabler/core/dist/css/tabler-payments.min.css";
@import "@tabler/core/dist/css/tabler-vendors.min.css";

html, body {
  height: 100%;
}

body {
  background-color: #f5f7fb;
}
`

    fs.writeFileSync(globalCssPath, GLOBAL_CSS.trim(), "utf8")

    /*
    ========================
    TABLER LAYOUT COMPONENT
    ========================
    */
    const componentsDir = path.join(frontendRoot, "components")
    fs.mkdirSync(componentsDir, { recursive: true })

    const layoutPath = path.join(componentsDir, "TablerLayout.js")

    const LAYOUT = `
import Link from "next/link"

export default function TablerLayout({ children }) {
  return (
    <div className="page">
      <aside className="navbar navbar-vertical navbar-expand-lg">
        <div className="container-fluid">
          <h1 className="navbar-brand">SterkBouw</h1>

          <div className="navbar-nav">
            <Link className="nav-link" href="/dashboard">Dashboard</Link>
            <Link className="nav-link" href="/calculaties">Calculaties</Link>
            <Link className="nav-link" href="/projecten">Projecten</Link>
            <Link className="nav-link" href="/bim">BIM</Link>
            <Link className="nav-link" href="/planning">Planning</Link>
            <Link className="nav-link" href="/inkoop">Inkoop</Link>
            <Link className="nav-link" href="/risico">Risico</Link>
          </div>
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

    fs.writeFileSync(layoutPath, LAYOUT.trim(), "utf8")

    /*
    ========================
    _app.js (WRAP MET LAYOUT)
    ========================
    */
    const pagesDir = path.join(frontendRoot, "pages")
    fs.mkdirSync(pagesDir, { recursive: true })

    const appJsPath = path.join(pagesDir, "_app.js")

    const APP_JS = `
import "../styles/globals.css"
import TablerLayout from "../components/TablerLayout"

export default function App({ Component, pageProps }) {
  return (
    <TablerLayout>
      <Component {...pageProps} />
    </TablerLayout>
  )
}
`

    fs.writeFileSync(appJsPath, APP_JS.trim(), "utf8")

    return {
      status: "ok",
      framework: "tabler",
      applied: true,
      files: [
        "styles/globals.css",
        "components/TablerLayout.js",
        "pages/_app.js"
      ]
    }

  } catch (err) {
    return {
      status: "error",
      error: err.message
    }
  }
}

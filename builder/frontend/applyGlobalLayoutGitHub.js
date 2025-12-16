import { Octokit } from "@octokit/rest"

const {
  GITHUB_TOKEN,
  FRONTEND_REPO_OWNER,
  FRONTEND_REPO_NAME,
  FRONTEND_REPO_BRANCH
} = process.env

if (!GITHUB_TOKEN || !FRONTEND_REPO_OWNER || !FRONTEND_REPO_NAME) {
  throw new Error("GitHub env vars ontbreken")
}

const octokit = new Octokit({ auth: GITHUB_TOKEN })
const branch = FRONTEND_REPO_BRANCH || "main"

async function upsertFile(path, content, message) {
  let sha = undefined

  try {
    const res = await octokit.repos.getContent({
      owner: FRONTEND_REPO_OWNER,
      repo: FRONTEND_REPO_NAME,
      path,
      ref: branch
    })
    sha = res.data.sha
  } catch (_) {}

  await octokit.repos.createOrUpdateFileContents({
    owner: FRONTEND_REPO_OWNER,
    repo: FRONTEND_REPO_NAME,
    path,
    message,
    content: Buffer.from(content).toString("base64"),
    sha,
    branch
  })
}

export async function applyGlobalLayoutGitHub() {
  const commitMsg = "chore(layout): force global dashboard layout"

  await upsertFile("pages/_app.js", APP_JS, commitMsg)
  await upsertFile("components/Layout.js", LAYOUT_JS, commitMsg)
  await upsertFile("components/DashboardLayout.js", DASHBOARD_LAYOUT_JS, commitMsg)

  return {
    status: "ok",
    committed: [
      "pages/_app.js",
      "components/Layout.js",
      "components/DashboardLayout.js"
    ],
    branch
  }
}

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

const DASHBOARD_LAYOUT_JS = `
import Link from "next/link"

export default function DashboardLayout({ children }) {
  return (
    <div className="sb-app-shell">
      <aside className="sb-sidebar">
        <div className="sb-logo">SterkBouw SaaS</div>
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

/*
INSTALL TABLER
- WORDT AANGEROEPEN VIA frontend:install_tabler
- VOERT NOG GEEN DEPLOY UIT
- GEEFT ALLEEN EEN ANALYSE TERUG (GATE STAP 1)
*/

export async function installTabler(payload = {}) {
  return {
    status: "ok",
    phase: "analysis",
    framework: "tabler",
    mode: payload.mode || "nextjs",
    scope: payload.scope || "global",
    files_to_create: [
      "components/AppShell.jsx",
      "components/Sidebar.jsx",
      "components/Topbar.jsx"
    ],
    files_to_modify: [
      "pages/_app.js"
    ],
    npm_packages: [
      "tabler",
      "@tabler/icons-react"
    ],
    message: "Tabler analyse voltooid, klaar voor dry-run"
  }
}

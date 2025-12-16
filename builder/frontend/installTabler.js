/*
TABLER INSTALL – ANALYSE FASE
- WORDT AANGEROEPEN VIA frontend:install_tabler
- GEEN DEPLOY
- GEEN FILE WRITES
- ALLEEN INVENTARISATIE
*/

export async function installTabler(payload = {}) {
  const { framework, mode, scope } = payload

  if (framework !== "tabler") {
    return {
      status: "ignored",
      reason: "NIET_TABLER_FRAMEWORK"
    }
  }

  return {
    status: "ok",
    phase: "analysis",
    framework: "tabler",
    target: {
      framework: mode,
      scope
    },
    required_packages: [
      "@tabler/core",
      "@tabler/icons",
      "bootstrap"
    ],
    required_assets: [
      "tabler.min.css",
      "tabler.min.js",
      "icons.svg"
    ],
    next_steps: [
      "Genereer globale Tabler layout component",
      "Vervang _app.js met Tabler wrapper",
      "Koppel navigatie aan bestaande routes",
      "Valideer pages router compatibiliteit",
      "Wacht op SQL deploy akkoord"
    ],
    gate: {
      sql_first: true,
      deploy_allowed: false,
      reason: "WACHT_OP_EXPLICIETE_DEPLOY_TASK"
    }
  }
}

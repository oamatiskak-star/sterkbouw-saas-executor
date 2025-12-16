import fs from "fs"
import path from "path"

export async function deployGateCheck() {
  const root = process.cwd()

  const required = [
    "pages/_app.js",
    "components/TablerLayout.js",
    "components/TablerNav.js"
  ]

  for (const file of required) {
    const full = path.join(root, file)
    if (!fs.existsSync(full)) {
      throw new Error("DEPLOY_GATE_FAIL: ontbreekt " + file)
    }
  }

  return {
    status: "ok",
    gate: "green"
  }
}

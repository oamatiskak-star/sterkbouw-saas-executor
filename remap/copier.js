import fs from "fs"
import path from "path"

function copyRecursive(src, dest) {
  if (!fs.existsSync(dest)) fs.mkdirSync(dest, { recursive: true })

  for (const item of fs.readdirSync(src)) {
    const s = path.join(src, item)
    const d = path.join(dest, item)

    if (fs.statSync(s).isDirectory()) {
      copyRecursive(s, d)
    } else {
      fs.copyFileSync(s, d)
    }
  }
}

export function executeRemap(planFile, workspaceRoot) {
  const plan = JSON.parse(fs.readFileSync(planFile))

  for (const item of plan) {
    const targetDir = path.join(workspaceRoot, item.target, path.basename(item.source))
    copyRecursive(item.source, targetDir)
  }
}

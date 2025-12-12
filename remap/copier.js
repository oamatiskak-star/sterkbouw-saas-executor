import fs from "fs"
import path from "path"

function copyDir(src, dest) {
  if (!fs.existsSync(dest)) fs.mkdirSync(dest, { recursive: true })
  for (const item of fs.readdirSync(src)) {
    const s = path.join(src, item)
    const d = path.join(dest, item)
    if (fs.statSync(s).isDirectory()) copyDir(s, d)
    else fs.copyFileSync(s, d)
  }
}

export function executePlan(planFile, sourceRoot, workspaceRoot) {
  const plan = JSON.parse(fs.readFileSync(planFile))
  plan.forEach(item => {
    const src = item.source
    const dest = path.join(workspaceRoot, item.target, path.basename(src))
    copyDir(src, dest)
  })
}

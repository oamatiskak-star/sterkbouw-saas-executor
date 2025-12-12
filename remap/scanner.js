import fs from "fs"
import path from "path"

const IGNORE = ["node_modules", ".git", ".next", ".vercel", ".zip"]

function scanDir(dir) {
  const entries = fs.readdirSync(dir, { withFileTypes: true })
  return entries
    .filter(e => !IGNORE.includes(e.name))
    .map(e => {
      const full = path.join(dir, e.name)
      if (e.isDirectory()) {
        return {
          type: "dir",
          name: e.name,
          path: full,
          children: scanDir(full)
        }
      }
      return {
        type: "file",
        name: e.name,
        path: full
      }
    })
}

export function runScanner(sourceRoot, outputFile) {
  const tree = scanDir(sourceRoot)
  fs.writeFileSync(outputFile, JSON.stringify(tree, null, 2))
}

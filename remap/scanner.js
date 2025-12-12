import fs from "fs"
import path from "path"

const IGNORE = [
  "node_modules",
  ".git",
  ".next",
  ".vercel",
  ".DS_Store",
  ".zip"
]

function scan(dir) {
  const result = []
  const entries = fs.readdirSync(dir, { withFileTypes: true })

  for (const e of entries) {
    if (IGNORE.includes(e.name)) continue
    const full = path.join(dir, e.name)

    if (e.isDirectory()) {
      result.push({
        type: "dir",
        name: e.name,
        path: full,
        children: scan(full)
      })
    } else {
      result.push({
        type: "file",
        name: e.name,
        path: full
      })
    }
  }
  return result
}

export function runScan(sourceRoot, outFile) {
  if (!fs.existsSync(sourceRoot)) {
    throw new Error("AO_SOURCE_PATH bestaat niet")
  }
  const tree = scan(sourceRoot)
  fs.mkdirSync(path.dirname(outFile), { recursive: true })
  fs.writeFileSync(outFile, JSON.stringify(tree, null, 2))
}

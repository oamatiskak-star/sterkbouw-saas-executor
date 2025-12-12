import fs from "fs"
import path from "path"

function hasChild(node, names) {
  if (!node.children) return false
  return node.children.some(c => names.includes(c.name))
}

export function classifyTree(tree) {
  const backend = []
  const frontend = []
  const executor = []
  const unknown = []

  function walk(node) {
    if (!node.children) return

    if (hasChild(node, ["server.js", "api", "controllers", "services", "models", "supabase"])) {
      backend.push(node.path)
    } else if (hasChild(node, ["app", "pages", "layout.js", "page.jsx", "styles", "components"])) {
      frontend.push(node.path)
    } else if (hasChild(node, ["execution_engine", "modules", "ai_workers", "github_sync", "vercel_deploy", "worker.js"])) {
      executor.push(node.path)
    } else {
      unknown.push(node.path)
    }

    node.children.forEach(walk)
  }

  tree.forEach(walk)

  return { backend, frontend, executor, unknown }
}

export function writeClassification(result, outDir) {
  fs.mkdirSync(outDir, { recursive: true })
  fs.writeFileSync(path.join(outDir, "backend-map.json"), JSON.stringify(result.backend, null, 2))
  fs.writeFileSync(path.join(outDir, "frontend-map.json"), JSON.stringify(result.frontend, null, 2))
  fs.writeFileSync(path.join(outDir, "executor-map.json"), JSON.stringify(result.executor, null, 2))
  fs.writeFileSync(path.join(outDir, "unknown-map.json"), JSON.stringify(result.unknown, null, 2))
}

import fs from "fs"

function has(entry, names) {
  return entry.children?.some(c => names.includes(c.name))
}

export function classify(tree) {
  const backend = []
  const frontend = []
  const executor = []
  const unknown = []

  function walk(node) {
    if (!node.children) return

    if (has(node, ["server.js", "controllers", "services", "models", "supabase", "api"])) {
      backend.push(node.path)
    } else if (has(node, ["app", "pages", "layout.js", "page.jsx", "styles", "components"])) {
      frontend.push(node.path)
    } else if (has(node, ["execution_engine", "modules", "ai_workers", "github_sync", "vercel_deploy", "worker.js"])) {
      executor.push(node.path)
    } else {
      unknown.push(node.path)
    }

    node.children.forEach(walk)
  }

  tree.forEach(walk)

  return { backend, frontend, executor, unknown }
}

export function writeMaps(result, outDir) {
  fs.writeFileSync(`${outDir}/backend-map.json`, JSON.stringify(result.backend, null, 2))
  fs.writeFileSync(`${outDir}/frontend-map.json`, JSON.stringify(result.frontend, null, 2))
  fs.writeFileSync(`${outDir}/executor-map.json`, JSON.stringify(result.executor, null, 2))
  fs.writeFileSync(`${outDir}/unknown-map.json`, JSON.stringify(result.unknown, null, 2))
}

import fs from "fs"
import path from "path"

export function buildRemapPlan(outDir) {
  const backend = JSON.parse(fs.readFileSync(path.join(outDir, "backend-map.json")))
  const frontend = JSON.parse(fs.readFileSync(path.join(outDir, "frontend-map.json")))
  const executor = JSON.parse(fs.readFileSync(path.join(outDir, "executor-map.json")))

  const plan = []

  backend.forEach(p => plan.push({ source: p, target: "backend" }))
  frontend.forEach(p => plan.push({ source: p, target: "frontend" }))
  executor.forEach(p => plan.push({ source: p, target: "executor" }))

  fs.writeFileSync(path.join(outDir, "remap-plan.json"), JSON.stringify(plan, null, 2))
}

import fs from "fs"

export function buildPlan(mapsDir) {
  const backend = JSON.parse(fs.readFileSync(`${mapsDir}/backend-map.json`))
  const frontend = JSON.parse(fs.readFileSync(`${mapsDir}/frontend-map.json`))
  const executor = JSON.parse(fs.readFileSync(`${mapsDir}/executor-map.json`))

  const plan = []

  backend.forEach(p => plan.push({ source: p, target: "backend" }))
  frontend.forEach(p => plan.push({ source: p, target: "frontend" }))
  executor.forEach(p => plan.push({ source: p, target: "executor" }))

  fs.writeFileSync(`${mapsDir}/remap-plan.json`, JSON.stringify(plan, null, 2))
}

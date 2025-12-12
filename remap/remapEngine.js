import fs from "fs"
import path from "path"
import { sendTelegram } from "../telegram/telegram.js"

const SOURCE_ROOT = path.resolve("./AO_MASTER_FULL_DEPLOY_CLEAN")

const TARGETS = {
  backend: path.resolve("./TARGET_BACKEND"),
  frontend: path.resolve("./TARGET_FRONTEND"),
  executor: path.resolve("./TARGET_EXECUTOR")
}

let WRITE_MODE = false

export function enableWriteMode() {
  WRITE_MODE = true
}

export async function runRemap(target, files, mode = "dry") {
  if (!TARGETS[target]) {
    await sendTelegram("❌ Ongeldig remap-target: " + target)
    return
  }

  const realMode = WRITE_MODE ? "write" : "dry"
  let processed = 0
  let errors = 0

  for (const relPath of files) {
    const src = path.join(SOURCE_ROOT, relPath)
    const dest = path.join(TARGETS[target], relPath)

    if (!fs.existsSync(src)) {
      errors++
      continue
    }

    if (realMode === "write") {
      try {
        fs.mkdirSync(path.dirname(dest), { recursive: true })
        fs.copyFileSync(src, dest)
      } catch (e) {
        errors++
        continue
      }
    }

    processed++
  }

  await sendTelegram(
    `📦 Remap ${realMode.toUpperCase()} afgerond\n` +
    `Target: ${target}\n` +
    `Bestanden verwerkt: ${processed}\n` +
    `Fouten: ${errors}`
  )
}

import fs from "fs"
import path from "path"
import { sendTelegram } from "../telegram/telegram.js"

const SOURCE_ROOT = path.resolve("./AO_MASTER_FULL_DEPLOY_CLEAN")

const TARGETS = {
  backend: path.resolve("./TARGET_BACKEND"),
  frontend: path.resolve("./TARGET_FRONTEND"),
  executor: path.resolve("./TARGET_EXECUTOR")
}

export async function runRemap(target, files, mode = "dry") {
  if (!TARGETS[target]) {
    await sendTelegram("❌ Ongeldig remap-target: " + target)
    return
  }

  let copied = 0

  for (const relPath of files) {
    const src = path.join(SOURCE_ROOT, relPath)
    const dest = path.join(TARGETS[target], relPath)

    if (!fs.existsSync(src)) continue

    if (mode === "dry") {
      copied++
      continue
    }

    fs.mkdirSync(path.dirname(dest), { recursive: true })
    fs.copyFileSync(src, dest)
    copied++
  }

  await sendTelegram(
    `📦 Remap ${mode.toUpperCase()} klaar\n` +
    `Target: ${target}\n` +
    `Bestanden: ${copied}`
  )
}

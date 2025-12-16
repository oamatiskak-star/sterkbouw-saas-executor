// builder/index.js

import fs from "fs"
import path from "path"

export async function runBuilder(payload) {
  const action = payload?.action || ""
  const filePath = payload?.path
  const content = payload?.content || ""

  if (!filePath || !content) {
    throw new Error("Payload mist 'path' of 'content'")
  }

  const fullPath = path.join(process.cwd(), filePath)
  const dir = path.dirname(fullPath)

  fs.mkdirSync(dir, { recursive: true })
  fs.writeFileSync(fullPath, content.trim())

  console.log(`✅ Bestand geschreven: ${filePath}`)
  return { status: "ok", file: filePath }
}

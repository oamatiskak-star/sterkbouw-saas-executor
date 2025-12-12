import axios from "axios"

let WRITE_MODE = false

export function enableWriteMode() {
  WRITE_MODE = true
  console.log("[AO][REMAP] WRITE MODE = AAN")
}

/* =======================
   ENV
======================= */
const GITHUB_OWNER = process.env.GITHUB_OWNER
const GITHUB_REPO = process.env.GITHUB_REPO
const GITHUB_BRANCH = process.env.GITHUB_BRANCH || "main"
const GITHUB_TOKEN = process.env.GITHUB_TOKEN

if (!GITHUB_OWNER || !GITHUB_REPO || !GITHUB_TOKEN) {
  console.error("[AO][REMAP][ENV FOUT] GitHub configuratie ontbreekt")
}

/* =======================
   GITHUB CLIENT
======================= */
const github = axios.create({
  baseURL: "https://github.com/oamatiskak-star/AO_MASTER_FULL_DEPLOY_CLEAN",
  headers: {
    Authorization: "Bearer " + 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,
    Accept: "application/vnd.github+json"
  }
})

/* =======================
   REMAP ENGINE
======================= */
export async function runRemap(target, files) {
  console.log("[AO][REMAP] START", target, "bestanden:", files.length)

  if (!WRITE_MODE) {
    console.log("[AO][REMAP] WRITE MODE UIT. Stop.")
    return
  }

  let success = 0
  let failed = 0

  for (const filePath of files) {
    try {
      console.log("[AO][REMAP] Lees:", filePath)

      const fileRes = await github.get(
        `/repos/${GITHUB_OWNER}/${GITHUB_REPO}/contents/${filePath}`,
        { params: { ref: GITHUB_BRANCH } }
      )

      const contentBase64 = fileRes.data?.content
      if (!contentBase64) {
        console.log("[AO][REMAP] Geen content:", filePath)
        failed++
        continue
      }

      const newPath = buildTargetPath(target, filePath)

      console.log("[AO][REMAP] Schrijf naar:", newPath)

      await github.put(
        `/repos/${GITHUB_OWNER}/${GITHUB_REPO}/contents/${newPath}`,
        {
          message: "AO remap: " + filePath + " -> " + target,
          content: contentBase64,
          branch: GITHUB_BRANCH
        }
      )

      success++

    } catch (err) {
      failed++
      console.error(
        "[AO][REMAP][FOUT]",
        filePath,
        err.response?.data?.message || err.message
      )
    }
  }

  console.log(
    "[AO][REMAP] KLAAR",
    target,
    "OK:",
    success,
    "FOUT:",
    failed
  )
}

/* =======================
   PATH HELPERS
======================= */
function buildTargetPath(target, originalPath) {
  const clean = originalPath.replace(/^\/+/, "")

  if (target === "backend") {
    return "backend/" + stripRoot(clean)
  }

  if (target === "frontend") {
    return "frontend/" + stripRoot(clean)
  }

  if (target === "executor") {
    return "executor/" + stripRoot(clean)
  }

  return target + "/" + stripRoot(clean)
}

function stripRoot(p) {
  return p
    .replace(/^backend\//, "")
    .replace(/^frontend\//, "")
    .replace(/^executor\//, "")
}

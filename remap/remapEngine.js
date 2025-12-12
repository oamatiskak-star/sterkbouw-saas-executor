import axios from "axios"

let WRITE_MODE = false

export function enableWriteMode() {
  WRITE_MODE = true
  console.log("[AO][REMAP] WRITE MODE = AAN")
}

const GITHUB_PAT = process.env.GITHUB_PAT
const GITHUB_REPO_FULL = process.env.GITHUB_REPO
const GITHUB_BRANCH = process.env.GITHUB_BRANCH || "main"

if (!GITHUB_PAT || !GITHUB_REPO_FULL) {
  console.error("[AO][REMAP][ENV FOUT] GITHUB_PAT of GITHUB_REPO ontbreekt")
}

const [GITHUB_OWNER, GITHUB_REPO] = GITHUB_REPO_FULL.split("/")

const github = axios.create({
  baseURL: "https://api.github.com",
  headers: {
    Authorization: "Bearer " + GITHUB_PAT,
    Accept: "application/vnd.github+json"
  }
})

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

      const content = fileRes.data.content
      const sha = fileRes.data.sha

      if (!content || !sha) {
        failed++
        continue
      }

      const newPath = buildTargetPath(target, filePath)

      await github.put(
        `/repos/${GITHUB_OWNER}/${GITHUB_REPO}/contents/${newPath}`,
        {
          message: "AO remap: " + filePath + " → " + target,
          content: content,
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

  console.log("[AO][REMAP] KLAAR", target, "OK:", success, "FOUT:", failed)
}

function buildTargetPath(target, originalPath) {
  const clean = originalPath.replace(/^\/+/g, "")

  if (target === "backend") return "backend/" + stripRoot(clean)
  if (target === "frontend") return "frontend/" + stripRoot(clean)
  if (target === "executor") return "executor/" + stripRoot(clean)

  return target + "/" + stripRoot(clean)
}

function stripRoot(p) {
  return p
    .replace(/^backend\//, "")
    .replace(/^frontend\//, "")
    .replace(/^executor\//, "")
}

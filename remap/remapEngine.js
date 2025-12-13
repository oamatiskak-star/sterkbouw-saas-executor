import axios from "axios"

let WRITE_MODE = false
let github = null
let OWNER = null
let REPO = null
let BRANCH = null

export function enableWriteMode() {
  WRITE_MODE = true
  console.log("[AO][REMAP] WRITE MODE AAN")
}

export function initRemapConfig() {
  const repoFull = process.env.GITHUB_REPO
  const token = process.env.GITHUB_PAT || process.env.GITHUB_TOKEN

  if (!repoFull || !token) {
    console.error("[AO][REMAP][ENV FOUT] GITHUB_REPO of GITHUB_PAT ontbreekt")
    return
  }

  const parts = repoFull.split("/")
  if (parts.length !== 2) {
    console.error("[AO][REMAP][ENV FOUT] GITHUB_REPO moet owner/repo zijn")
    return
  }

  OWNER = parts[0]
  REPO = parts[1]
  BRANCH = process.env.GITHUB_BRANCH || "main"

  github = axios.create({
    baseURL: "https://api.github.com",
    headers: {
      Authorization: "token " + token,
      Accept: "application/vnd.github+json",
      "User-Agent": "AO-Executor"
    }
  })

  console.log("[AO][REMAP] GitHub config OK:", OWNER + "/" + REPO)
}

export async function runRemap(target, files = []) {
  if (!github) {
    throw new Error("GitHub niet geïnitialiseerd")
  }

  /* =======================
     SCAN MODE
  ======================= */
  if (target === "scan") {
    const all = []

    async function walk(dir = "") {
      const res = await github.get(
        `/repos/${OWNER}/${REPO}/contents/${dir}`,
        { params: { ref: BRANCH } }
      )

      for (const item of res.data) {
        if (item.type === "dir") {
          await walk(item.path)
        } else if (item.type === "file") {
          all.push(item.path)
        }
      }
    }

    await walk()
    return all
  }

  /* =======================
     WRITE MODE CHECK
  ======================= */
  if (!WRITE_MODE) {
    console.log("[AO][REMAP] WRITE MODE UIT")
    return
  }

  let ok = 0
  let fail = 0

  for (const file of files) {
    try {
      const res = await github.get(
        `/repos/${OWNER}/${REPO}/contents/${file}`,
        { params: { ref: BRANCH } }
      )

      const newPath =
        target + "/" + file.replace(/^(backend|frontend|executor)\//, "")

      await github.put(
        `/repos/${OWNER}/${REPO}/contents/${newPath}`,
        {
          message: "AO remap → " + target,
          content: res.data.content,
          branch: BRANCH
        }
      )

      ok++
    } catch (e) {
      fail++
      console.error("[AO][REMAP][FOUT]", file)
    }
  }

  console.log("[AO][REMAP] KLAAR", target, "OK:", ok, "FOUT:", fail)
}

import axios from "axios"

let WRITE_MODE = false
let github = null
let OWNER = null
let REPO = null
let BRANCH = null

const processedFiles = new Set()
let consecutiveErrors = 0
const MAX_ERRORS = 20

export function enableWriteMode() {
WRITE_MODE = true
console.log("[AO][REMAP] WRITE MODE AAN")
}

export function initRemapConfig() {
const repoFull = process.env.GITHUB_REPO
const token = process.env.GITHUB_PAT || process.env.GITHUB_TOKEN

if (!repoFull || !token) {
throw new Error("GITHUB_REPO of GITHUB_PAT ontbreekt")
}

const parts = repoFull.split("/")
if (parts.length !== 2) {
throw new Error("GITHUB_REPO moet owner/repo zijn")
}

OWNER = parts[0]
REPO = parts[1]
BRANCH = process.env.GITHUB_BRANCH || "main"

github = axios.create({
baseURL: "https://api.github.com
",
headers: {
Authorization: "token " + token,
Accept: "application/vnd.github+json",
"User-Agent": "AO-Executor"
}
})

console.log("[AO][REMAP] GitHub config OK:", OWNER + "/" + REPO)
}

/* =======================
UTILS
======================= */
function isGeneratedFile(path) {
if (path.includes("1") || path.includes("2") || path.includes("3")) return true
if (path.endsWith(".log")) return true
if (path.includes("/remapped/")) return true
return false
}

async function ensureDirExists(dir) {
const parts = dir.split("/")
let current = ""

for (const part of parts) {
current = current ? current + "/" + part : part
try {
await github.get(/repos/${OWNER}/${REPO}/contents/${current}, {
params: { ref: BRANCH }
})
} catch {
await github.put(/repos/${OWNER}/${REPO}/contents/${current}/.gitkeep, {
message: "AO mkdir " + current,
content: Buffer.from("").toString("base64"),
branch: BRANCH
})
}
}
}

/* =======================
CORE
======================= */
export async function runRemap(target, files = []) {
if (!github) throw new Error("GitHub niet geïnitialiseerd")

if (target === "scan") {
console.log("[AO][SCAN] git tree scan gestart")

const res = await github.get(
  `/repos/${OWNER}/${REPO}/git/trees/${BRANCH}`,
  { params: { recursive: 1 } }
)

return res.data.tree
  .filter(item => item.type === "blob")
  .map(item => item.path)


}

if (!WRITE_MODE) {
console.log("[AO][REMAP] WRITE MODE UIT")
return
}

let ok = 0
let fail = 0

for (const file of files) {
if (processedFiles.has(file)) continue
processedFiles.add(file)

if (isGeneratedFile(file)) continue

const newPath =
  target + "/" + file.replace(/^(backend|frontend|executor)\//, "")

try {
  const dir = newPath.split("/").slice(0, -1).join("/")
  await ensureDirExists(dir)

  const res = await github.get(
    `/repos/${OWNER}/${REPO}/contents/${file}`,
    { params: { ref: BRANCH } }
  )

  await github.put(
    `/repos/${OWNER}/${REPO}/contents/${newPath}`,
    {
      message: "AO remap → " + target,
      content: res.data.content,
      branch: BRANCH
    }
  )

  ok++
  consecutiveErrors = 0
} catch (e) {
  fail++
  consecutiveErrors++
  console.error("[AO][REMAP][FOUT]", file)

  if (consecutiveErrors >= MAX_ERRORS) {
    throw new Error("Te veel remap fouten. Proces gestopt.")
  }
}


}

console.log("[AO][REMAP] KLAAR", target, "OK:", ok, "FOUT:", fail)
}

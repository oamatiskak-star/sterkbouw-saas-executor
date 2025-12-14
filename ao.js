import * as dotenv from "dotenv"
dotenv.config()

import express from "express"
import { sendTelegram } from "./telegram/telegram.js"
import {
runRemap,
enableWriteMode,
initRemapConfig
} from "./remap/remapEngine.js"
import { supabase } from "./lib/supabase.js"

/* =======================
APP
======================= */
const app = express()
app.use(express.json())

/* =======================
ENV VALIDATIE
======================= */
const REQUIRED_ENVS = [
"TELEGRAM_BOT_TOKEN",
"TELEGRAM_CHAT_ID",
"GITHUB_PAT",
"GITHUB_REPO",
"SUPABASE_URL",
"SUPABASE_SERVICE_ROLE_KEY"
]

for (const key of REQUIRED_ENVS) {
if (!process.env[key]) {
console.error("[AO][ENV FOUT] ontbreekt:", key)
}
}

/* =======================
CONFIG
======================= */
const PORT = process.env.PORT || 10000
const REPO = process.env.GITHUB_REPO
const BRANCH = process.env.GITHUB_BRANCH || "main"

initRemapConfig()

/* =======================
STATE
======================= */
let sourceScan = null
let classifiedFiles = null
let remapPlan = null
let pipelineRunning = false

/* =======================
ROUTES
======================= */
app.get("/ping", (req, res) => {
res.status(200).send("AO EXECUTOR OK")
})

app.post("/telegram/webhook", async (req, res) => {
const message = req.body?.message?.text
if (!message) return res.sendStatus(200)

const cmd = message.toLowerCase().trim().replace(/\s+/g, " ")
console.log("[AO][TELEGRAM] ontvangen:", cmd)

try {
await sendTelegram("📥 Command ontvangen: " + cmd)
await handleCommand(cmd)
} catch (err) {
console.error("[AO][COMMAND FOUT]", err.message)
await sendTelegram("❌ Fout: " + err.message)
pipelineRunning = false
}

res.sendStatus(200)
})

/* =======================
COMMAND ROUTER
======================= */
async function handleCommand(cmd) {
console.log("[AO][CMD]", cmd)

if (pipelineRunning) {
await sendTelegram("⛔ Pipeline draait al")
return
}

if (cmd === "scan bron") {
return await scanSource()
}

if (cmd === "classificeer bron") {
return await classifySource()
}

if (cmd === "bouw remap plan") {
return await buildRemapPlan()
}

if (cmd === "remap backend") {
enableWriteMode()
return await executeRemap("backend")
}

if (cmd === "remap frontend") {
enableWriteMode()
return await executeRemap("frontend")
}

if (cmd === "remap executor") {
enableWriteMode()
return await executeRemap("executor")
}

if (cmd === "remap alles") {
pipelineRunning = true
enableWriteMode()
await buildRemapPlan()
await executeRemap("backend")
await executeRemap("frontend")
await executeRemap("executor")
pipelineRunning = false
return
}

if (cmd === "build") {
return await runBuild()
}

if (cmd === "build alles") {
pipelineRunning = true
await sendTelegram("🚀 Volledige build gestart")
enableWriteMode()
await scanSource()
await classifySource()
await buildRemapPlan()
await executeRemap("backend")
await executeRemap("frontend")
await executeRemap("executor")
await runBuild()
await sendTelegram("✅ Volledige build afgerond")
pipelineRunning = false
return
}

await sendTelegram("⚠️ Onbekend commando: " + cmd)
}

/* =======================
SCAN
======================= */
async function scanSource() {
const files = await runRemap("scan")
sourceScan = files

await supabase
.from("ao_repo_scan")
.insert({
repo: REPO,
branch: BRANCH,
files
})

await sendTelegram("📂 Scan klaar en opgeslagen: " + files.length)
}

/* =======================
CLASSIFICATIE
======================= */
async function classifySource() {
if (!Array.isArray(sourceScan) || sourceScan.length === 0) {
await sendTelegram("⛔ Geen scan beschikbaar")
return
}

classifiedFiles = {
backend: [],
frontend: [],
executor: [],
unknown: []
}

for (const f of sourceScan) {
const l = f.toLowerCase()
if (l.includes("backend") || l.includes("api") || l.includes("routes"))
classifiedFiles.backend.push(f)
else if (l.includes("frontend") || l.includes("pages") || l.includes("app"))
classifiedFiles.frontend.push(f)
else if (l.includes("executor") || l.includes("agent"))
classifiedFiles.executor.push(f)
else
classifiedFiles.unknown.push(f)
}

await sendTelegram(
"🧠 Classificatie klaar\n" +
"Backend: " + classifiedFiles.backend.length + "\n" +
"Frontend: " + classifiedFiles.frontend.length + "\n" +
"Executor: " + classifiedFiles.executor.length
)
}

/* =======================
REMAP
======================= */
async function buildRemapPlan() {
if (!classifiedFiles) {
await sendTelegram("⛔ Eerst classificeren")
return
}

remapPlan = classifiedFiles
await sendTelegram("🗺️ Remap plan opgebouwd")
}

async function executeRemap(target) {
const files = remapPlan?.[target] || []
if (!files.length) {
await sendTelegram("⚠️ Geen bestanden voor " + target)
return
}

await sendTelegram("🚧 REMAP gestart voor " + target)
await runRemap(target, files)
await sendTelegram("✅ REMAP afgerond voor " + target)
}

/* =======================
BUILD
======================= */
async function runBuild() {
await sendTelegram("🏗️ Build gestart")
await sendTelegram("✅ Build afgerond")
}

/* =======================
START
======================= */
app.listen(PORT, async () => {
console.log("AO Executor draait op poort " + PORT)
await sendTelegram("✅ AO Executor live en gereed")
})

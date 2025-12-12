import fs from "fs"
import path from "path"
import { sendTelegram } from "../telegram/telegram.js"

const BASE_REPO = "/opt/render/project/src/AO_MASTER_FULL_DEPLOY_CLEAN"
const OUTPUT_PATH = "/opt/render/project/src/agent_output"

const projectMapping = {
  backend: ["juridisch", "api", "routes", "supabase", "fixed-price"],
  frontend: ["pages", "public", "components", "dashboard", "calculators"],
  executor: ["telegram", "agent", "command-router", "logger"]
}

export async function importeerTakenUitOudeRepo() {
  try {
    fs.mkdirSync(OUTPUT_PATH, { recursive: true })
    let totaalAantalBestanden = 0

    for (const [project, mappen] of Object.entries(projectMapping)) {
      const projectPath = path.join(OUTPUT_PATH, project)
      fs.mkdirSync(projectPath, { recursive: true })

      for (const mapNaam of mappen) {
        const bron = path.join(BASE_REPO, mapNaam)
        const doel = path.join(projectPath, mapNaam)

        if (fs.existsSync(bron)) {
          kopieerMap(bron, doel)
          totaalAantalBestanden += telBestanden(doel)
        }
      }
    }

    await sendTelegram(`📥 Taken geïmporteerd uit oude repo\nTotaal: ${totaalAantalBestanden} bestanden`)
  } catch (e) {
    await sendTelegram("❌ Fout bij importeren taken\n" + e.message)
    console.error(e)
  }
}

function kopieerMap(bron, doel) {
  if (!fs.existsSync(doel)) fs.mkdirSync(doel, { recursive: true })

  for (const item of fs.readdirSync(bron)) {
    const bronPath = path.join(bron, item)
    const doelPath = path.join(doel, item)

    if (fs.statSync(bronPath).isDirectory()) {
      kopieerMap(bronPath, doelPath)
    } else {
      fs.copyFileSync(bronPath, doelPath)
    }
  }
}

function telBestanden(map) {
  let count = 0
  for (const file of fs.readdirSync(map, { withFileTypes: true })) {
    const filePath = path.join(map, file.name)
    if (file.isDirectory()) {
      count += telBestanden(filePath)
    } else {
      count++
    }
  }
  return count
}

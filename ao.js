import { exec } from "child_process"
import fs from "fs"
import path from "path"

const OLD_PROJECT_PATH = "/path/to/AO_MASTER_FULL_DEPLOY_CLEAN" // Pas aan met je werkelijke pad
const NEW_PROJECT_PATH = path.resolve("/opt/render/project/src/sterkbouw-saas-executor")

export async function importFromMaster() {
  console.log("[AO] Start importeren van oude modules uit AO_MASTER")

  try {
    // Importeren van backend-logica naar backend map
    const backendDir = path.join(OLD_PROJECT_PATH, "backend/api")
    const backendDest = path.join(NEW_PROJECT_PATH, "sterkbouw-saas-back/backend/api")
    copyFiles(backendDir, backendDest)

    // Importeren van frontend-pagina's naar frontend map
    const frontendDir = path.join(OLD_PROJECT_PATH, "frontend/pages")
    const frontendDest = path.join(NEW_PROJECT_PATH, "sterkbouw-saas-front/pages")
    copyFiles(frontendDir, frontendDest)

    // Importeren van algemene executor-taken
    const executorDir = path.join(OLD_PROJECT_PATH, "executor/tasks")
    const executorDest = path.join(NEW_PROJECT_PATH, "sterkbouw-saas-executor/executor/tasks")
    copyFiles(executorDir, executorDest)

    // Telegrapherend loggen van succesvolle import
    await sendTelegram("[AO] Import van oude modules uit AO_MASTER voltooid.")
  } catch (err) {
    console.error("[AO] Fout bij importeren van oude modules:", err)
    await sendTelegram("[AO] Fout bij importeren van oude modules.")
  }
}

// Hulpfunctie om bestanden en mappen te kopiëren
function copyFiles(sourceDir, destDir) {
  const files = fs.readdirSync(sourceDir)
  files.forEach(file => {
    const srcPath = path.join(sourceDir, file)
    const destPath = path.join(destDir, file)
    if (fs.lstatSync(srcPath).isDirectory()) {
      if (!fs.existsSync(destPath)) fs.mkdirSync(destPath)
      copyFiles(srcPath, destPath) // Recursieve kopie van submappen
    } else {
      fs.copyFileSync(srcPath, destPath)
    }
  })
}

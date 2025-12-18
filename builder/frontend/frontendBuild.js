import { execSync } from "child_process"
import fs from "fs"

const FRONTEND_ROOT = "/app/frontend"
const FRONTEND_REPO =
  "https://x-access-token:" +
  process.env.GITHUB_TOKEN +
  "@github.com/oamatiskak-star/sterkbouw-saas-front.git"

export async function frontendBuild() {
  console.log("FRONTEND BUILD START")

  if (!process.env.GITHUB_TOKEN) {
    throw new Error("GITHUB_TOKEN ontbreekt")
  }

  if (!fs.existsSync(FRONTEND_ROOT + "/.git")) {
    console.log("FRONTEND REPO CLONE START")
    execSync(`git clone ${FRONTEND_REPO} ${FRONTEND_ROOT}`, {
      stdio: "inherit"
    })
  }

  execSync('git config user.name "AO Executor"', { cwd: FRONTEND_ROOT })
  execSync('git config user.email "ao-executor@users.noreply.github.com"', {
    cwd: FRONTEND_ROOT
  })

  execSync("git status", { cwd: FRONTEND_ROOT, stdio: "inherit" })
  execSync("git add .", { cwd: FRONTEND_ROOT, stdio: "inherit" })
  execSync('git commit -m "auto: generate ui" || true', {
    cwd: FRONTEND_ROOT,
    stdio: "inherit"
  })
  execSync("git push", { cwd: FRONTEND_ROOT, stdio: "inherit" })

  console.log("FRONTEND BUILD DONE")
  return { status: "done" }
}

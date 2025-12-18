import { execSync } from "child_process"
import fs from "fs"
import path from "path"

const FRONTEND_ROOT = "/tmp/frontend"
const FRONTEND_REPO =
  "https://x-access-token:" +
  process.env.GITHUB_TOKEN +
  "@github.com/oamatiskak-star/sterkbouw-saas-front.git"

export async function frontendBuild() {
  console.log("FRONTEND BUILD START")

  if (!process.env.GITHUB_TOKEN) {
    throw new Error("GITHUB_TOKEN_ONTBREEKT")
  }

  if (!process.env.GIT_AUTHOR_NAME || !process.env.GIT_AUTHOR_EMAIL) {
    throw new Error("GIT_IDENTITY_ONTBREEKT")
  }

  fs.mkdirSync("/tmp", { recursive: true })

  /*
  ========================
  REPO VOORBEREIDING
  ========================
  */
  if (!fs.existsSync(FRONTEND_ROOT)) {
    console.log("FRONTEND ROOT BESTAAT NIET, CLONE START")
    execSync(`git clone ${FRONTEND_REPO} ${FRONTEND_ROOT}`, {
      stdio: "inherit"
    })
  }

  if (!fs.existsSync(path.join(FRONTEND_ROOT, ".git"))) {
    throw new Error("FRONTEND_ROOT_BESTAAT_MAAR_IS_GEEN_GIT_REPO")
  }

  /*
  ========================
  GIT CONFIG LOKAAL
  ========================
  */
  execSync(`git config user.name "${process.env.GIT_AUTHOR_NAME}"`, {
    cwd: FRONTEND_ROOT,
    stdio: "inherit"
  })

  execSync(`git config user.email "${process.env.GIT_AUTHOR_EMAIL}"`, {
    cwd: FRONTEND_ROOT,
    stdio: "inherit"
  })

  /*
  ========================
  SYNC MET REMOTE
  ========================
  */
  console.log("FRONTEND GIT PULL")
  execSync("git pull --rebase || true", {
    cwd: FRONTEND_ROOT,
    stdio: "inherit"
  })

  /*
  ========================
  COMMIT + PUSH
  ========================
  */
  execSync("git status", {
    cwd: FRONTEND_ROOT,
    stdio: "inherit"
  })

  execSync("git add .", {
    cwd: FRONTEND_ROOT,
    stdio: "inherit"
  })

  execSync(
    'git commit -m "auto: generate ui" || echo "NO_CHANGES_TO_COMMIT"',
    {
      cwd: FRONTEND_ROOT,
      stdio: "inherit"
    }
  )

  execSync("git push", {
    cwd: FRONTEND_ROOT,
    stdio: "inherit"
  })

  console.log("FRONTEND BUILD DONE")

  return { status: "done" }
}

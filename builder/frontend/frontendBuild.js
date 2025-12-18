import { execSync } from "child_process"
import fs from "fs"

const FRONTEND_ROOT = "/app/frontend"

export async function frontendBuild() {
  console.log("FRONTEND BUILD START")

  if (!fs.existsSync(FRONTEND_ROOT)) {
    throw new Error("FRONTEND_ROOT_BESTAAT_NIET")
  }

  try {
    execSync("git status", {
      cwd: FRONTEND_ROOT,
      stdio: "inherit"
    })
  } catch {
    throw new Error("GEEN_GIT_REPO_IN_FRONTEND_ROOT")
  }

  execSync("git add .", {
    cwd: FRONTEND_ROOT,
    stdio: "inherit"
  })

  execSync(
    'git commit -m "auto: generate ui" || true',
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

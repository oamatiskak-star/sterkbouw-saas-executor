import { execSync } from "child_process"

const FRONTEND_ROOT = "/app/frontend"

export async function frontendBuild() {
  console.log("FRONTEND BUILD START")

  execSync("git add .", { cwd: FRONTEND_ROOT, stdio: "inherit" })
  execSync(
    'git commit -m "auto: generate frontend ui" || true',
    { cwd: FRONTEND_ROOT, stdio: "inherit" }
  )
  execSync("git push", { cwd: FRONTEND_ROOT, stdio: "inherit" })

  console.log("FRONTEND BUILD DONE")

  return { status: "done" }
}

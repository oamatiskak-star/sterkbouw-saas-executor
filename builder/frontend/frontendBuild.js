import { execSync } from "child_process"

const FRONTEND_ROOT = "/app/frontend"

export async function frontendBuild() {
  console.log("FRONTEND BUILD START")

  if (!process.env.GITHUB_TOKEN) {
    throw new Error("GITHUB_TOKEN ontbreekt")
  }

  const repoUrl =
    "https://x-access-token:" +
    process.env.GITHUB_TOKEN +
    "@github.com/oamatiskak-star/sterkbouw-saas-front.git"

  execSync("git add .", { cwd: FRONTEND_ROOT, stdio: "inherit" })

  execSync(
    'git commit -m "auto: generate frontend ui" || true',
    { cwd: FRONTEND_ROOT, stdio: "inherit" }
  )

  execSync(
    `git push ${repoUrl}`,
    { cwd: FRONTEND_ROOT, stdio: "inherit" }
  )

  console.log("FRONTEND BUILD DONE")

  return { status: "done" }
}

import fs from "fs"
import path from "path"

export async function generateTablerLogin() {
  const content = `
export default function Login() {
  return (
    <div className="container-tight py-6">
      <div className="card card-md">
        <div className="card-body">
          <h2 className="text-center mb-4">Inloggen</h2>
          <input className="form-control mb-2" placeholder="Email" />
          <input className="form-control mb-4" type="password" placeholder="Wachtwoord" />
          <button className="btn btn-primary w-100">Login</button>
        </div>
      </div>
    </div>
  )
}
`
  fs.writeFileSync(
    path.join(process.cwd(), "pages", "login.js"),
    content.trim(),
    "utf8"
  )

  return { status: "ok" }
}

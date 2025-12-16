import fs from "fs"
import path from "path"

export async function buildFullUiLayout() {
  const filePath = path.join("pages", "index.js")

  // Stap 1: zorg dat de map bestaat
  if (!fs.existsSync("pages")) {
    fs.mkdirSync("pages", { recursive: true })
  }

  // Stap 2: schrijf de loginpagina
  const content = `import { useState } from "react"

export default function Login() {
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-100">
      <div className="bg-white shadow-xl rounded-3xl p-10 w-full max-w-md">
        <h1 className="text-2xl font-bold mb-6 text-center">Login</h1>
        <form className="space-y-4">
          <input
            type="email"
            placeholder="Email"
            className="w-full px-4 py-2 rounded-xl border border-gray-300 focus:outline-none"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
          <input
            type="password"
            placeholder="Wachtwoord"
            className="w-full px-4 py-2 rounded-xl border border-gray-300 focus:outline-none"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
          <button
            type="submit"
            className="w-full bg-yellow-400 hover:bg-yellow-500 text-black font-bold py-2 px-4 rounded-xl transition"
          >
            Inloggen
          </button>
        </form>
      </div>
    </div>
  )
}
`

  fs.writeFileSync(filePath, content, "utf8")
}

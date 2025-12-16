import fs from "fs"
import path from "path"

export async function generateLoginForm(payload) {
  const content = `
    import { useState } from "react"

    export default function Login() {
      const [email, setEmail] = useState("")
      const [password, setPassword] = useState("")

      const handleLogin = () => {
        // TODO: voeg login logica toe
        alert("Login met: " + email)
      }

      return (
        <div className="flex min-h-screen items-center justify-center bg-gray-100">
          <div className="bg-white p-10 rounded-xl shadow-xl w-full max-w-sm">
            <h1 className="text-xl font-bold mb-6 text-center">SterkBouw Inloggen</h1>
            <input className="w-full mb-4 p-2 border rounded" placeholder="Email" onChange={e => setEmail(e.target.value)} />
            <input className="w-full mb-4 p-2 border rounded" placeholder="Wachtwoord" type="password" onChange={e => setPassword(e.target.value)} />
            <button className="w-full bg-yellow-400 text-black py-2 rounded" onClick={handleLogin}>
              Inloggen
            </button>
          </div>
        </div>
      )
    }
  `

  const outputPath = path.join("pages", "index.js")
  fs.writeFileSync(outputPath, content)
  return { success: true }
}

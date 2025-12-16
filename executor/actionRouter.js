import { runBuilder } from "../builder/index.js"
import fs from "fs/promises"
import path from "path"

export async function runAction(actionId, payload) {
  if (actionId === "builder:generate_module") {
    return await runBuilder(payload)
  }

  if (actionId === "frontend:full_ui_layout") {
    return await buildFullUILoginPage()
  }

  throw new Error("ONBEKENDE_ACTION")
}

async function buildFullUILoginPage() {
  const targetPath = path.join(process.cwd(), "pages", "index.js")

  const loginPageCode = `
import { useState } from "react"

export default function Home() {
  return (
    <div className="min-h-screen bg-gray-100 flex items-center justify-center">
      <div className="bg-white rounded-3xl shadow-xl p-10 w-full max-w-md">
        <h1 className="text-2xl font-bold mb-4 text-center">Welkom bij SterkBouw</h1>
        <p className="text-sm text-center text-gray-500 mb-8">
          Log in om toegang te krijgen tot jouw projecten, calculaties en dashboards
        </p>
        <form className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">E-mailadres</label>
            <input type="email" className="w-full px-4 py-2 border rounded" placeholder="voorbeeld@sterkbouw.nl" />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Wachtwoord</label>
            <input type="password" className="w-full px-4 py-2 border rounded" placeholder="••••••••" />
          </div>
          <button type="submit" className="w-full bg-yellow-400 text-black py-2 rounded font-bold hover:bg-yellow-300">
            Inloggen
          </button>
        </form>
      </div>
    </div>
  )
}
`

  await fs.writeFile(targetPath, loginPageCode)
  console.log("✅ Loginpagina gegenereerd op:", targetPath)
}

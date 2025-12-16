import fs from "fs"
import path from "path"

export async function applyTablerLayout() {
  try {
    const root = process.cwd()
    const appPath = path.join(root, "pages", "_app.js")

    const CONTENT = `
import "../styles/globals.css"
import TablerLayout from "../components/TablerLayout"

export default function App({ Component, pageProps }) {
  return (
    <TablerLayout>
      <Component {...pageProps} />
    </TablerLayout>
  )
}
`.trim()

    fs.writeFileSync(appPath, CONTENT, "utf8")

    return {
      status: "ok",
      applied: true,
      file: "pages/_app.js"
    }

  } catch (err) {
    return {
      status: "error",
      error: err.message
    }
  }
}

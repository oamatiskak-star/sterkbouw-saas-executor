import fs from "fs"
import path from "path"

export async function runBuilder(task) {
  const { project_id, payload } = task
  const route = payload?.route || "/onbekend"
  const moduleName = payload?.module_name || "onbekend"
  const content = payload?.content || null
  const layout = payload?.layout || "default"
  const fullPath = path.join("pages", route.replace("/", "") + ".js")

  console.log("BUILDER START builder:generate_module PROJECT:", project_id)

  try {
    const code = generatePageCode({
      route,
      moduleName,
      layout,
      content
    })

    fs.writeFileSync(fullPath, code)

    console.log("BUILDER RESULT SUCCESS builder:generate_module")
    return { status: "success" }

  } catch (err) {
    console.error("BUILDER RESULT FAILED builder:generate_module", err.message)
    return { status: "failed", error: err.message }
  }
}

function generatePageCode({ route, moduleName, layout, content }) {
  const layoutImport = layout === "none" ? "" : "import Layout from '../layout'"
  const openLayout = layout === "none" ? "" : `<Layout active=\"${route.replace("/", "")}\">`
  const closeLayout = layout === "none" ? "" : "</Layout>"

  const inner = content || `<h1>${moduleName}</h1>\n<p>Deze pagina is automatisch gegenereerd via builder.</p>`

  return `
    ${layoutImport}

    export default function ${capitalize(moduleName)}() {
      return (
        ${openLayout}
          ${inner}
        ${closeLayout}
      )
    }

    function capitalize(text) {
      return text.charAt(0).toUpperCase() + text.slice(1)
    }
  `
}

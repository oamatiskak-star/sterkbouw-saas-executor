import { runBuilder } from "../builder/index.js"

export async function architectFullUiBuild(task) {
  const payload = task.payload || {}
  const pages = payload.pages || []

  if (!Array.isArray(pages) || pages.length === 0) {
    throw new Error("GEEN_PAGINAS_IN_PAYLOAD")
  }

  console.log("ARCHITECT UI BUILD START")
  console.log("PAGINAS:", pages.length)

  for (const page of pages) {
    console.log("GENEREER PAGINA:", page.route)

    await runBuilder({
      actionId: "frontend_generate_standard_page",
      route: page.route,
      title: page.title,
      kpis: page.kpis || [],
      actions: page.actions || []
    })
  }

  console.log("ALLE PAGINAS GEREED – FRONTEND BUILD")

  await runBuilder({
    actionId: "frontend_build"
  })

  console.log("ARCHITECT UI BUILD KLAAR")

  return { status: "done" }
}

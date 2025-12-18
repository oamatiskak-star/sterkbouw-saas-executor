import { runBuilder } from "../builder/index.js"

export async function architectFullUiBuild(task) {
  const payload = task.payload || {}
  const pages = payload.pages || []

  if (!Array.isArray(pages) || pages.length === 0) {
    throw new Error("GEEN_PAGINAS_IN_PAYLOAD")
  }

  console.log("ARCHITECT UI BUILD START")
  console.log("AANTAL PAGINAS:", pages.length)

  for (const page of pages) {
    if (!page.route) {
      console.warn("PAGINA OVERGESLAGEN ZONDER ROUTE", page)
      continue
    }

    console.log("GENEREER PAGINA:", page.route)

    await runBuilder({
      actionId: "frontend_generate_standard_page",
      taskId: task.id,
      payload: {
        route: page.route,
        title: page.title || "Pagina",
        kpis: page.kpis || [],
        actions: page.actions || []
      }
    })
  }

  console.log("ALLE PAGINAS GESCHREVEN – START FRONTEND BUILD")

  await runBuilder({
    actionId: "frontend_build",
    taskId: task.id
  })

  console.log("ARCHITECT UI BUILD KLAAR")

  return { status: "done", pages: pages.length }
}

import { buildNieuwbouwStabu } from "./nieuwbouw.js"
import { buildTransformatieStabu } from "./transformatie.js"

export async function runStabuBuilder({ supabase, project }) {
  if (!project || !project.id) {
    throw new Error("stabu_builder_no_project")
  }

  const type = project.project_type || "nieuwbouw"

  if (type === "nieuwbouw") {
    await buildNieuwbouwStabu({
      supabase,
      project_id: project.id
    })
    return
  }

  if (type === "transformatie") {
    await buildTransformatieStabu({
      supabase,
      project_id: project.id
    })
    return
  }

  throw new Error("stabu_builder_unknown_project_type")
}

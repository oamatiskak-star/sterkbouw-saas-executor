import { createClient } from "@supabase/supabase-js"

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
)

export async function handleProjectAnalysis(task) {
  const project_id = task.project_id
  if (!project_id) return

  const missing = []
  const warnings = []

  // Project ophalen
  const { data: project } = await supabase
    .from("projects")
    .select("project_type")
    .eq("id", project_id)
    .single()

  const projectType = project?.project_type

  // Bestanden ophalen
  const { data: files } = await supabase
    .from("project_files")
    .select("file_type")
    .eq("project_id", project_id)

  const has = type => files?.some(f => f.file_type === type)

  /*
  ============================
  ANALYSE-REGELS
  ============================
  */

  if (!projectType) {
    missing.push("project_type")
  }

  if (projectType === "renovatie") {
    if (!has("tekening_bestaand")) missing.push("tekening_bestaand")
    if (!has("foto_bestaand")) missing.push("foto_bestaand")
  }

  if (projectType === "transformatie") {
    if (!has("tekening_bestaand")) missing.push("tekening_bestaand")
    if (!has("tekening_nieuw")) missing.push("tekening_nieuw")
  }

  if (projectType === "nieuwbouw_met_sloop") {
    if (!has("tekening_bestaand")) missing.push("tekening_bestaand")
    if (!has("tekening_nieuw")) missing.push("tekening_nieuw")
  }

  if (projectType === "nieuwbouw") {
    if (!has("tekening_nieuw")) missing.push("tekening_nieuw")
  }

  /*
  ============================
  STATUS BEPALEN – NOOIT STOPPEN
  ============================
  */
  let status = "compleet"

  if (missing.length > 0) {
    status = "onvolledig"
    warnings.push(
      "Calculatie is onvolledig. Ontbrekende onderdelen worden niet automatisch gerekend."
    )
  }

  await supabase
    .from("projects")
    .update({
      analysis_status: status,
      missing_items: missing,
      warnings: warnings
    })
    .eq("id", project_id)
}

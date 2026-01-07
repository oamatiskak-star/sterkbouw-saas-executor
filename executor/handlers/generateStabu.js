// executor/handlers/generateStabu.js
import { createClient } from "@supabase/supabase-js"

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
)

console.log("[GENERATE_STABU] Module loaded")

async function fail(taskId, msg) {
  console.error("[GENERATE_STABU] Task failed:", taskId, msg)

  if (!taskId) return
  await supabase
    .from("executor_tasks")
    .update({
      status: "failed",
      error: msg,
      finished_at: new Date().toISOString()
    })
    .eq("id", taskId)
}

async function ensureCalculatie(project_id) {
  const { data: existing, error } = await supabase
    .from("calculaties")
    .select("id")
    .eq("project_id", project_id)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle()

  if (error) return null
  if (existing) return existing.id

  const { data, error: insertErr } = await supabase
    .from("calculaties")
    .insert({
      project_id,
      workflow_status: "initialized",
      created_at: new Date().toISOString()
    })
    .select("id")
    .single()

  if (insertErr) return null
  return data.id
}

export async function handleGenerateStabu(task) {
  if (!task?.id || !task.project_id) return

  const taskId = task.id
  const project_id = task.project_id
  const now = new Date().toISOString()

  try {
    await supabase
      .from("executor_tasks")
      .update({ status: "running", started_at: now })
      .eq("id", taskId)

    const calculatieId = await ensureCalculatie(project_id)

    const { data: project } = await supabase
      .from("projects")
      .select("project_type, projectnaam, adres, plaatsnaam")
      .eq("id", project_id)
      .single()

    const type = project?.project_type || "nieuwbouw"
    const text = `${project?.projectnaam || ""} ${project?.adres || ""} ${project?.plaatsnaam || ""}`
    const words = text.split(/\s+/).filter(Boolean).length
    const oppervlakte = words > 2 ? words * 20 : 120

    const basisPosten = type === "nieuwbouw"
      ? [
          { code: "21.10", omschrijving: "Grondwerk en fundering", eenheid: "m²", hoeveelheid: oppervlakte, prijs_eenh: 85, normuren: 2.5 },
          { code: "22.20", omschrijving: "Casco en draagconstructie", eenheid: "m²", hoeveelheid: oppervlakte, prijs_eenh: 195, normuren: 6.0 },
          { code: "24.30", omschrijving: "Gevels en kozijnen", eenheid: "m²", hoeveelheid: oppervlakte * 0.8, prijs_eenh: 125, normuren: 3.5 },
          { code: "31.40", omschrijving: "Daken en isolatie", eenheid: "m²", hoeveelheid: oppervlakte, prijs_eenh: 75, normuren: 2.0 },
          { code: "41.10", omschrijving: "Installaties E en W", eenheid: "stuk", hoeveelheid: 1, prijs_eenh: 45000, normuren: 120 },
          { code: "51.90", omschrijving: "Afbouw en oplevering", eenheid: "stuk", hoeveelheid: 1, prijs_eenh: 32000, normuren: 80 }
        ]
      : [
          { code: "12.10", omschrijving: "Sloop en stripwerk", eenheid: "m²", hoeveelheid: oppervlakte, prijs_eenh: 55, normuren: 1.8 },
          { code: "21.30", omschrijving: "Constructieve aanpassingen", eenheid: "m²", hoeveelheid: oppervlakte, prijs_eenh: 95, normuren: 3.0 },
          { code: "24.30", omschrijving: "Gevel en isolatie", eenheid: "m²", hoeveelheid: oppervlakte * 0.8, prijs_eenh: 110, normuren: 3.0 },
          { code: "41.10", omschrijving: "Installaties E en W", eenheid: "stuk", hoeveelheid: 1, prijs_eenh: 38000, normuren: 100 },
          { code: "51.90", omschrijving: "Afbouw en herindeling", eenheid: "stuk", hoeveelheid: 1, prijs_eenh: 28000, normuren: 70 }
        ]

    // ============================
    // NIEUW: STABU PROJECT POSTEN
    // ============================
    const stabuPosten = basisPosten.map(post => ({
      project_id,
      stabu_post_id: null,
      stabu_code: post.code,
      omschrijving: post.omschrijving,
      eenheid: post.eenheid,
      normuren: post.normuren,
      arbeidsprijs: 55,
      materiaalprijs: post.prijs_eenh,
      hoeveelheid: post.hoeveelheid,
      geselecteerd: true,
      oa_perc: 0.08,
      oa_bedrag: 0,
      stelp_eenh: 0,
      stelp_tot: 0,
      created_at: now,
      updated_at: now
    }))

    const { error: stabuErr } = await supabase
      .from("stabu_project_posten")
      .insert(stabuPosten)

    if (stabuErr) {
      throw new Error("STABU_POSTEN_INSERT_FAILED: " + stabuErr.message)
    }

    // ============================
    // BESTAANDE CALCULATIE_REGELS
    // ============================
    await supabase
      .from("calculatie_regels")
      .delete()
      .eq("project_id", project_id)

    const calculatieRegels = basisPosten.map(post => {
      const loonkostenPerEenheid = (post.normuren || 0) * 55
      const materiaalprijsPerEenheid = (post.prijs_eenh || 0) * 0.6
      const totaal = (post.prijs_eenh || 0) * (post.hoeveelheid || 1)

      return {
        project_id,
        calculatie_id: calculatieId,
        stabu_id: null,
        code: post.code,
        omschrijving: post.omschrijving,
        eenheid: post.eenheid,
        aantal: post.hoeveelheid,
        eenh: post.eenheid,
        hoeveelheid: post.hoeveelheid,
        normuren: post.normuren,
        m_norm: post.normuren,
        uren: (post.normuren || 0) * (post.hoeveelheid || 1),
        prijs_eenh: post.prijs_eenh,
        arbeidsprijs: loonkostenPerEenheid,
        loonkosten: loonkostenPerEenheid * post.hoeveelheid,
        materiaalprijs: materiaalprijsPerEenheid,
        materiaalkosten: materiaalprijsPerEenheid * post.hoeveelheid,
        oa_eenh: 8,
        oa: totaal * 0.08,
        stelp_eenh: 0,
        stelposten: 0
      }
    })

    await supabase
      .from("calculatie_regels")
      .insert(calculatieRegels)

    await supabase
      .from("executor_tasks")
      .update({ status: "completed", finished_at: now })
      .eq("id", taskId)

  } catch (err) {
    await fail(taskId, err.message)
  }
}

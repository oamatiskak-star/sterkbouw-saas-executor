import { PDFDocument, StandardFonts } from "pdf-lib"
import { createClient } from "@supabase/supabase-js"

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
)

const A4_P = { w: 595, h: 842 }
const A4_L = { w: 842, h: 595 }

/*
===========================================================
2JOURS PDF GENERATOR – DEFINITIEF
- gebruikt vaste 2jours template (GEEN create)
- voorblad + opdracht = template
- calculatie = invulling
- één doorlopende PDF
===========================================================
*/

export async function generate2joursPdf(project_id) {
  if (!project_id) {
    throw new Error("NO_PROJECT_ID")
  }

  /*
  ============================
  PROJECT
  ============================
  */
  const { data: project, error: projectError } = await supabase
    .from("projects")
    .select("*")
    .eq("id", project_id)
    .single()

  if (projectError || !project) {
    throw new Error("PROJECT_NOT_FOUND")
  }

  /*
  ============================
  TEMPLATE LADEN (VERPLICHT)
  ============================
  */
  const TEMPLATE_PATH = "templates/2jours_basis.pdf"

  const { data: templateFile, error: templateError } = await supabase
    .storage
    .from("sterkcalc")
    .download(TEMPLATE_PATH)

  if (templateError || !templateFile) {
    throw new Error("2JOURS_TEMPLATE_NOT_FOUND")
  }

  const templateBytes = await templateFile.arrayBuffer()
  const pdf = await PDFDocument.load(templateBytes)
  const font = await pdf.embedFont(StandardFonts.Helvetica)

  /*
  ============================
  DATA
  ============================
  */
  const { data: regels = [] } = await supabase
    .from("v_calculatie_2jours")
    .select("*")
    .eq("project_id", project_id)
    .order("hoofdstuk_code")
    .order("subhoofdstuk_code")
    .order("code")

  const { data: stelposten = [] } = await supabase
    .from("calculatie_stelposten")
    .select("*")
    .eq("project_id", project_id)

  const { data: correcties } = await supabase
    .from("calculatie_correcties")
    .select("*")
    .eq("project_id", project_id)
    .single()

  const { data: uurlonen = [] } = await supabase
    .from("calculatie_uurloon_overrides")
    .select("*")
    .eq("project_id", project_id)

  /*
  ============================
  CALCULATIE PAGINA(’S)
  ============================
  */
  let page = pdf.addPage([A4_L.w, A4_L.h])
  let x0 = 30
  let y = 560

  const header = () => {
    const cols = [
      "Code",
      "Omschrijving",
      "Aantal",
      "Eenh",
      "Norm",
      "Uren",
      "Loon",
      "Mat/eh",
      "Mat tot",
      "Stelp",
      "Totaal"
    ]
    let x = x0
    cols.forEach(c => {
      page.drawText(String(c), { x, y, size: 9, font })
      x += 75
    })
    y -= 15
  }

  header()

  for (const r of regels) {
    if (y < 40) {
      page = pdf.addPage([A4_L.w, A4_L.h])
      y = 560
      header()
    }

    let x = x0
    const row = [
      r.code,
      r.omschrijving,
      r.aantal,
      r.eenheid,
      r.normuren,
      r.uren,
      r.loonkosten,
      r.materiaalprijs,
      r.materiaalkosten,
      r.stelposten,
      r.totaal
    ]

    row.forEach(v => {
      page.drawText(String(v ?? ""), { x, y, size: 8, font })
      x += 75
    })

    y -= 12
  }

  /*
  ============================
  STELPOSTEN
  ============================
  */
  if (stelposten.length > 0) {
    page = pdf.addPage([A4_L.w, A4_L.h])
    y = 560

    page.drawText("STELPOSTEN", { x: 30, y, size: 14, font })
    y -= 30

    stelposten.forEach(s => {
      page.drawText(
        `${s.omschrijving} – € ${Number(s.bedrag || 0).toFixed(2)}`,
        { x: 30, y, size: 10, font }
      )
      y -= 14
    })
  }

  /*
  ============================
  AANNAMES / CORRECTIES
  ============================
  */
  page = pdf.addPage([A4_L.w, A4_L.h])
  y = 560

  page.drawText("AANNAMES EN CORRECTIES", { x: 30, y, size: 14, font })
  y -= 30

  page.drawText(
    `AK ${correcties?.ak_pct * 100 || 0}% | ABK ${correcties?.abk_pct * 100 || 0}% | W ${correcties?.w_pct * 100 || 0}% | R ${correcties?.r_pct * 100 || 0}%`,
    { x: 30, y, size: 10, font }
  )

  y -= 30
  page.drawText("Uurlonen:", { x: 30, y, size: 11, font })
  y -= 15

  uurlonen.forEach(u => {
    page.drawText(
      `${u.discipline}: € ${u.uurloon}/uur`,
      { x: 30, y, size: 10, font }
    )
    y -= 12
  })

  /*
  ============================
  OPSLAAN + PROJECT LINK
  ============================
  */
  const bytes = await pdf.save()
  const outputPath = `${project_id}/calculatie_2jours.pdf`

  await supabase.storage
    .from("sterkcalc")
    .upload(outputPath, bytes, {
      contentType: "application/pdf",
      upsert: true
    })

  const publicUrl = `${process.env.SUPABASE_URL}/storage/v1/object/public/sterkcalc/${outputPath}`

  await supabase
    .from("projects")
    .update({ pdf_url: publicUrl })
    .eq("id", project_id)

  return {
    status: "completed",
    project_id,
    pdf_url: publicUrl
  }
}

import { createClient } from "@supabase/supabase-js"
import { PDFDocument, rgb, StandardFonts } from "pdf-lib"

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
)

/*
===========================================================
2JOURS PDF GENERATOR – IMAGE BACKGROUND (DEFINITIEF)
- Excel layout = PNG achtergrond
- PDF-lib rendert alleen dynamische data
- Eén system of record
===========================================================
*/

const BUCKET = "sterkcalc"
const PATH_VOORBLAD = "templates/2jours_voorblad.png"
const PATH_CALCULATIE = "templates/2jours_calculatie.png"
const PATH_STAARTBLAD = "templates/2jours_staartblad.png"

const A4_P = [595, 842]
const A4_L = [842, 595]

function assert(cond, msg) {
  if (!cond) throw new Error(msg)
}

function euro(n) {
  return `€ ${Number(n || 0).toFixed(2)}`
}

async function loadPng(pdf, path) {
  const { data, error } = await supabase.storage.from(BUCKET).download(path)
  if (error || !data) throw new Error("PNG_NOT_FOUND: " + path)
  const bytes = await data.arrayBuffer()
  return await pdf.embedPng(bytes)
}

export async function generate2joursPdf(project_id) {
  assert(project_id, "NO_PROJECT_ID")

  /*
  ============================
  PROJECT DATA
  ============================
  */
  const { data: project } = await supabase
    .from("projects")
    .select("*")
    .eq("id", project_id)
    .single()

  assert(project, "PROJECT_NOT_FOUND")

  const { data: regels } = await supabase
    .from("calculatie_regels")
    .select("*")
    .eq("project_id", project_id)
    .order("stabu_code")

 const hasRegels = Array.isArray(regels) && regels.length > 0

  /*
  ============================
  PDF INIT
  ============================
  */
  const pdf = await PDFDocument.create()
  const font = await pdf.embedFont(StandardFonts.Helvetica)

  const imgVoorblad = await loadPng(pdf, PATH_VOORBLAD)
  const imgCalc = await loadPng(pdf, PATH_CALCULATIE)
  const imgStaart = await loadPng(pdf, PATH_STAARTBLAD)

  /*
  ============================
  1. VOORBLAD
  ============================
  */
  const p1 = pdf.addPage(A4_P)
  p1.drawImage(imgVoorblad, { x: 0, y: 0, width: A4_P[0], height: A4_P[1] })

  p1.drawText(project.opdrachtgever || "", { x: 70, y: 600, size: 10, font })
  p1.drawText(project.naam || "", { x: 70, y: 560, size: 10, font })
  p1.drawText(project.plaatsnaam || "", { x: 70, y: 520, size: 10, font })
  p1.drawText(project.offertenummer || "", { x: 420, y: 600, size: 9, font })
  p1.drawText(project.offertedatum || "", { x: 420, y: 580, size: 9, font })

  /*
  ============================
  2. CALCULATIEBLAD
  ============================
  */
  const p2 = pdf.addPage(A4_L)
  p2.drawImage(imgCalc, { x: 0, y: 0, width: A4_L[0], height: A4_L[1] })

  let y = 460

  for (const r of regels) {
    if (y < 80) break

    p2.drawText(r.stabu_code || "", { x: 40, y, size: 8, font })
    p2.drawText(r.omschrijving || "", { x: 110, y, size: 8, font })
    p2.drawText(String(r.hoeveelheid || ""), { x: 380, y, size: 8, font })
    p2.drawText(euro(r.totaal), { x: 760, y, size: 8, font })

    y -= 16
  }

  /*
  ============================
  3. STAARTBLAD / TOTALEN
  ============================
  */
  const p3 = pdf.addPage(A4_L)
  p3.drawImage(imgStaart, { x: 0, y: 0, width: A4_L[0], height: A4_L[1] })

  const totaal = regels.reduce((s, r) => s + Number(r.totaal || 0), 0)

  p3.drawText(euro(totaal), { x: 760, y: 220, size: 9, font })

  /*
  ============================
  OPSLAAN
  ============================
  */
  const bytes = await pdf.save()
  const target = `${project_id}/offerte_2jours.pdf`

  await supabase.storage.from(BUCKET).upload(target, bytes, {
    upsert: true,
    contentType: "application/pdf"
  })

  const pdf_url =
    `${process.env.SUPABASE_URL}/storage/v1/object/public/${BUCKET}/${target}`

  await supabase.from("projects").update({ pdf_url }).eq("id", project_id)

  return { status: "DONE", pdf_url }
}

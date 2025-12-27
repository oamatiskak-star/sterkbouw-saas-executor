// executor/pdf/generate2joursPdf.js

import xlsx from "xlsx"
import { PDFDocument, rgb, StandardFonts } from "pdf-lib"
import { createClient } from "@supabase/supabase-js"

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
)

/*
===========================================================
2JOURS PDF – DEFINITIEF (LEEG MAG, CRASH MAG NOOIT)
===========================================================
- PDF wordt ALTIJD gegenereerd
- Calculatie kan leeg zijn
- Geen executor crash meer
===========================================================
*/

const TEMPLATE_BUCKET = "sterkcalc"
const TEMPLATE_PATH = "templates/2jours_layout_template_v1.xlsx"

function assert(cond, msg) {
  if (!cond) throw new Error(msg)
}

function euro(n) {
  return `€ ${Number(n || 0).toFixed(2)}`
}

function isRed(cell) {
  const c = cell?.s?.font?.color?.rgb
  return c && c.toUpperCase() === "FFFF0000"
}

export async function generate2joursPdf(project_id) {
  assert(project_id, "NO_PROJECT_ID")

  /* =========================
     PROJECT
  ========================= */
  const { data: project } = await supabase
    .from("projects")
    .select("*")
    .eq("id", project_id)
    .single()

  assert(project, "PROJECT_NOT_FOUND")

  /* =========================
     CALCULATIE (MAG LEEG)
  ========================= */
  const { data: regelsRaw } = await supabase
    .from("v_calculatie_2jours")
    .select("*")
    .eq("project_id", project_id)
    .order("hoofdstuk_code")
    .order("code")

  const regels = Array.isArray(regelsRaw) ? regelsRaw : []

  /* =========================
     TEMPLATE
  ========================= */
  const { data: file } = await supabase
    .storage
    .from(TEMPLATE_BUCKET)
    .download(TEMPLATE_PATH)

  assert(file, "TEMPLATE_NOT_FOUND")

  const buffer = Buffer.from(await file.arrayBuffer())
  const workbook = xlsx.read(buffer, { cellStyles: true })

  /* =========================
     PDF INIT
  ========================= */
  const pdf = await PDFDocument.create()
  const font = await pdf.embedFont(StandardFonts.Helvetica)

  /* =========================
     VOORBLAD
  ========================= */
  renderSheet({
    pdf,
    font,
    sheet: workbook.Sheets["Voorblad"],
    size: [595, 842],
    project,
    regels
  })

  /* =========================
     CALCULATIE REGELS (MAG LEEG)
  ========================= */
  renderCalculatie({
    pdf,
    font,
    regels
  })

  /* =========================
     STAARTBLAD
  ========================= */
  renderSheet({
    pdf,
    font,
    sheet: workbook.Sheets["Staartblad"],
    size: [842, 595],
    project,
    regels
  })

  /* =========================
     OPSLAAN
  ========================= */
  const bytes = await pdf.save()
  const path = `${project_id}/offerte_2jours.pdf`

  await supabase.storage.from("sterkcalc").upload(path, bytes, {
    upsert: true,
    contentType: "application/pdf"
  })

  const publicUrl =
    `${process.env.SUPABASE_URL}/storage/v1/object/public/sterkcalc/${path}`

  await supabase
    .from("projects")
    .update({ pdf_url: publicUrl })
    .eq("id", project_id)

  return { status: "DONE", pdf_url: publicUrl }
}

/* =========================
   GENERIC SHEET
========================= */
function renderSheet({ pdf, font, sheet, size, project, regels }) {
  if (!sheet) return

  const page = pdf.addPage(size)

  for (const addr in sheet) {
    if (addr.startsWith("!")) continue
    const cell = sheet[addr]
    if (cell.v == null) continue

    const x = 40 + (cell.c || 0) * 60
    const y = size[1] - 40 - (cell.r || 0) * 18

    let value = cell.v

    if (isRed(cell)) {
      value = resolveDynamicValue(String(cell.v), project)
    }

    page.drawText(String(value), {
      x,
      y,
      size: 8,
      font,
      color: rgb(0, 0, 0)
    })
  }
}

/* =========================
   CALCULATIE REGELS
========================= */
function renderCalculatie({ pdf, font, regels }) {
  let page = pdf.addPage([842, 595])
  let y = 555

  for (const r of regels) {
    if (y < 40) {
      page = pdf.addPage([842, 595])
      y = 555
    }

    page.drawText(r.code || "", { x: 40, y, size: 8, font })
    page.drawText(r.omschrijving || "", { x: 90, y, size: 8, font })
    page.drawText(euro(r.totaal), { x: 720, y, size: 8, font })

    y -= 18
  }
}

/* =========================
   DYNAMIC VALUES
========================= */
function resolveDynamicValue(text, project) {
  const t = text.toLowerCase()

  if (t.includes("opdrachtgever")) return project.opdrachtgever || ""
  if (t.includes("projectnaam")) return project.naam || ""
  if (t.includes("plaats")) return project.plaatsnaam || ""
  if (t.includes("offertenummer")) return project.offertenummer || ""
  if (t.includes("datum")) return project.offertedatum || ""

  return ""
}

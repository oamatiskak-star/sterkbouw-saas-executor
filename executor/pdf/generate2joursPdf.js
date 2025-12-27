// executor/pdf/generate2joursPdf.js
//
// INTERNE PDF GENERATOR – 2JOURS
// Wordt aangeroepen met: await generate2joursPdf(project_id)

import xlsx from "xlsx"
import { PDFDocument, rgb, StandardFonts } from "pdf-lib"
import { createClient } from "@supabase/supabase-js"

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
)

const TEMPLATE_BUCKET = "sterkcalc"
const TEMPLATE_PATH = "templates/2jours_layout_template_v1.xlsx"

// =========================
// HELPERS
// =========================
function assert(cond, msg) {
  if (!cond) throw new Error(msg)
}

function euro(n) {
  return `€ ${Number(n || 0).toFixed(2)}`
}

function isRed(cell) {
  const rgb = cell?.s?.font?.color?.rgb
  if (!rgb) return false
  return rgb.toUpperCase().endsWith("FF0000")
}

// Excel column widths → PDF points
function colWidthToPt(w) {
  if (!w) return 40
  return w * 7
}

// =========================
// MAIN
// =========================
export async function generate2joursPdf(project_id) {
  assert(project_id, "NO_PROJECT_ID")

  // -------------------------
  // DATA
  // -------------------------
  const { data: project } = await supabase
    .from("projects")
    .select("*")
    .eq("id", project_id)
    .single()

  assert(project, "PROJECT_NOT_FOUND")

  const { data: regels } = await supabase
    .from("v_calculatie_2jours")
    .select("*")
    .eq("project_id", project_id)
    .order("hoofdstuk_code")
    .order("code")

  assert(Array.isArray(regels), "NO_CALCULATIE_DATA")

  // -------------------------
  // TEMPLATE
  // -------------------------
  const { data: file } = await supabase
    .storage
    .from(TEMPLATE_BUCKET)
    .download(TEMPLATE_PATH)

  assert(file, "TEMPLATE_NOT_FOUND")

  const buffer = Buffer.from(await file.arrayBuffer())
  const workbook = xlsx.read(buffer, { cellStyles: true })

  const pdf = await PDFDocument.create()
  const font = await pdf.embedFont(StandardFonts.Helvetica)

  // -------------------------
  // RENDER SHEETS
  // -------------------------
  renderSheet(pdf, font, workbook.Sheets["Voorblad"], project)
  renderSheet(pdf, font, workbook.Sheets["Voorblad calculatie_regels"], project)
  renderCalculatie(pdf, font, workbook.Sheets["Calculatie_regels"], regels)
  renderSheet(pdf, font, workbook.Sheets["Staartblad"], project)

  // -------------------------
  // SAVE
  // -------------------------
  const bytes = await pdf.save()
  const target = `${project_id}/offerte_2jours.pdf`

  await supabase.storage.from("sterkcalc").upload(target, bytes, {
    upsert: true,
    contentType: "application/pdf"
  })

  const url =
    `${process.env.SUPABASE_URL}/storage/v1/object/public/sterkcalc/${target}`

  await supabase
    .from("projects")
    .update({ pdf_url: url })
    .eq("id", project_id)

  return { pdf_url: url }
}

// =========================
// GENERIC SHEET RENDER
// =========================
function renderSheet(pdf, font, sheet, project) {
  const page = pdf.addPage([595, 842])
  const ref = xlsx.utils.decode_range(sheet["!ref"])

  // column x-positions
  const colX = []
  let accX = 40
  for (let c = 0; c <= ref.e.c; c++) {
    colX[c] = accX
    const w = sheet["!cols"]?.[c]?.wpx
    accX += colWidthToPt(w)
  }

  for (const addr in sheet) {
    if (addr.startsWith("!")) continue
    const cell = sheet[addr]
    if (cell.v == null) continue

    const { c, r } = xlsx.utils.decode_cell(addr)

    const x = colX[c]
    const y = 842 - 40 - r * 16

    let value = cell.v
    if (isRed(cell)) {
      value = resolveDynamic(value, project)
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

// =========================
// CALCULATIE PAGINA’S
// =========================
function renderCalculatie(pdf, font, sheet, regels) {
  let page = pdf.addPage([842, 595])
  let y = 555

  for (const r of regels) {
    if (y < 40) {
      page = pdf.addPage([842, 595])
      y = 555
    }

    page.drawText(r.code, { x: 40, y, size: 8, font })
    page.drawText(r.omschrijving, { x: 90, y, size: 8, font })
    page.drawText(euro(r.totaal), { x: 760, y, size: 8, font })

    y -= 16
  }
}

// =========================
// DYNAMIC VALUES
// =========================
function resolveDynamic(text, project) {
  const t = String(text).toLowerCase()

  if (t.includes("projectnaam")) return project.naam
  if (t.includes("opdrachtgever")) return project.opdrachtgever
  if (t.includes("plaats")) return project.plaatsnaam
  if (t.includes("offertenummer")) return project.offertenummer
  if (t.includes("datum")) return project.offertedatum

  return ""
}

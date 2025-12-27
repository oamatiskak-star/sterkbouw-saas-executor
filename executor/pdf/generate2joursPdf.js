// actions/generate_2jours_pdf.js

import fs from "fs"
import path from "path"
import xlsx from "xlsx"
import { PDFDocument, rgb, StandardFonts } from "pdf-lib"
import { createClient } from "@supabase/supabase-js"

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
)

// =========================
// CONFIG
// =========================
const TEMPLATE_BUCKET = "sterkcalc"
const TEMPLATE_PATH = "templates/2jours_layout_template_v1.xlsx"

// RGB rood = dynamisch
const DYNAMIC_RED = { r: 255, g: 0, b: 0 }

// =========================
// HELPERS
// =========================
function assert(cond, msg) {
  if (!cond) throw new Error(msg)
}

function isRed(cell) {
  const c = cell?.s?.font?.color?.rgb
  if (!c) return false
  return c.toUpperCase() === "FFFF0000"
}

function euro(n) {
  return `€ ${Number(n || 0).toFixed(2)}`
}

// =========================
// MAIN ACTION
// =========================
export default async function generate2joursPdf(task) {
  const project_id = task.project_id
  assert(project_id, "NO_PROJECT_ID")

  // =========================
  // LOAD PROJECT
  // =========================
  const { data: project } = await supabase
    .from("projects")
    .select("*")
    .eq("id", project_id)
    .single()

  assert(project, "PROJECT_NOT_FOUND")

  // =========================
  // LOAD CALCULATIE VIEW
  // =========================
  const { data: regels } = await supabase
    .from("v_calculatie_2jours")
    .select("*")
    .eq("project_id", project_id)
    .order("hoofdstuk_code")
    .order("code")

  assert(Array.isArray(regels), "NO_CALCULATIE_DATA")

  // =========================
  // DOWNLOAD TEMPLATE
  // =========================
  const { data: file } = await supabase
    .storage
    .from(TEMPLATE_BUCKET)
    .download(TEMPLATE_PATH)

  assert(file, "TEMPLATE_NOT_FOUND")

  const buffer = Buffer.from(await file.arrayBuffer())
  const workbook = xlsx.read(buffer, { cellStyles: true })

  // =========================
  // PDF INIT
  // =========================
  const pdf = await PDFDocument.create()
  const font = await pdf.embedFont(StandardFonts.Helvetica)

  // =========================
  // RENDER SHEETS
  // =========================

  // ---------- VOORBLAD ----------
  renderSheet({
    pdf,
    font,
    sheet: workbook.Sheets["Voorblad"],
    pageSize: "A4_P",
    project,
    regels,
    pageIndex: 1
  })

  // ---------- VOORBLAD CALCULATIE ----------
  renderSheet({
    pdf,
    font,
    sheet: workbook.Sheets["Voorblad calculatie_regels"],
    pageSize: "A4_L",
    project,
    regels
  })

  // ---------- CALCULATIE REGELS ----------
  renderCalculatieRegels({
    pdf,
    font,
    sheet: workbook.Sheets["Calculatie_regels"],
    regels
  })

  // ---------- STAARTBLAD ----------
  renderSheet({
    pdf,
    font,
    sheet: workbook.Sheets["Staartblad"],
    pageSize: "A4_L",
    project,
    regels,
    totals: true
  })

  // =========================
  // SAVE & UPLOAD
  // =========================
  const pdfBytes = await pdf.save()
  const targetPath = `${project_id}/offerte_2jours.pdf`

  await supabase.storage.from("sterkcalc").upload(targetPath, pdfBytes, {
    upsert: true,
    contentType: "application/pdf"
  })

  const publicUrl =
    `${process.env.SUPABASE_URL}/storage/v1/object/public/sterkcalc/${targetPath}`

  await supabase
    .from("projects")
    .update({ pdf_url: publicUrl })
    .eq("id", project_id)

  return {
    status: "DONE",
    pdf_url: publicUrl
  }
}

// =========================
// GENERIC SHEET RENDERER
// =========================
function renderSheet({ pdf, font, sheet, pageSize, project, regels }) {
  const size =
    pageSize === "A4_P"
      ? [595, 842]
      : [842, 595]

  const page = pdf.addPage(size)

  for (const addr in sheet) {
    if (addr.startsWith("!")) continue
    const cell = sheet[addr]
    const text = cell.v

    if (text == null) continue

    const x = 40 + (cell.c || 0) * 60
    const y = size[1] - 40 - (cell.r || 0) * 18

    let value = text

    if (isRed(cell)) {
      value = resolveDynamicValue(text, project, regels)
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
// CALCULATIE REGELS RENDER
// =========================
function renderCalculatieRegels({ pdf, font, sheet, regels }) {
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

// =========================
// DYNAMIC VALUE RESOLVER
// =========================
function resolveDynamicValue(text, project, regels) {
  const t = String(text).toLowerCase()

  if (t.includes("naam opdrachtgever")) return project.opdrachtgever
  if (t.includes("projectomschrijving")) return project.omschrijving
  if (t.includes("projectnaam")) return project.naam
  if (t.includes("plaatsnaam")) return project.plaatsnaam
  if (t.includes("offertenummer")) return project.offertenummer
  if (t.includes("offertedatum")) return project.offertedatum

  return ""
}

import xlsx from "xlsx"
import { PDFDocument, rgb, StandardFonts } from "pdf-lib"
import { createClient } from "@supabase/supabase-js"

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
)

/*
===========================================================
2JOURS PDF – TEMPLATE GEDREVEN (EXCEL = SOURCE OF TRUTH)
- Geen task-object
- Alleen project_id
- Layout exact uit Excel
===========================================================
*/

const TEMPLATE_BUCKET = "sterkcalc"
const TEMPLATE_PATH = "templates/2jours_layout_template_v1.xlsx"

const A4_P = [595, 842]
const A4_L = [842, 595]

function assert(cond, msg) {
  if (!cond) throw new Error(msg)
}

function euro(n) {
  return `€ ${Number(n || 0).toFixed(2)}`
}

function isRed(cell) {
  const rgbVal = cell?.s?.font?.color?.rgb
  return rgbVal && rgbVal.toUpperCase() === "FFFF0000"
}

/*
===========================================================
MAIN
===========================================================
*/
export async function generate2joursPdf(project_id) {
  assert(project_id, "NO_PROJECT_ID")

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

  assert(Array.isArray(regels) && regels.length > 0, "NO_CALCULATIE_DATA")

  const { data: templateFile } = await supabase
    .storage
    .from(TEMPLATE_BUCKET)
    .download(TEMPLATE_PATH)

  assert(templateFile, "TEMPLATE_NOT_FOUND")

  const buffer = Buffer.from(await templateFile.arrayBuffer())
  const workbook = xlsx.read(buffer, { cellStyles: true })

  const pdf = await PDFDocument.create()
  const font = await pdf.embedFont(StandardFonts.Helvetica)

  renderSheet({
    pdf,
    font,
    sheet: workbook.Sheets["Voorblad"],
    size: A4_P,
    project,
    regels
  })

  renderSheet({
    pdf,
    font,
    sheet: workbook.Sheets["Voorblad calculatie_regels"],
    size: A4_L,
    project,
    regels
  })

  renderCalculatieRegels({
    pdf,
    font,
    regels
  })

  renderSheet({
    pdf,
    font,
    sheet: workbook.Sheets["Staartblad"],
    size: A4_L,
    project,
    regels
  })

  const pdfBytes = await pdf.save()
  const path = `${project_id}/offerte_2jours.pdf`

  await supabase.storage.from("sterkcalc").upload(path, pdfBytes, {
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

/*
===========================================================
GENERIC SHEET RENDERER (EXCEL → PDF)
===========================================================
*/
function renderSheet({ pdf, font, sheet, size, project, regels }) {
  if (!sheet) return

  const page = pdf.addPage(size)

  for (const addr in sheet) {
    if (addr.startsWith("!")) continue

    const cell = sheet[addr]
    if (cell.v == null) continue

    const { c, r } = xlsx.utils.decode_cell(addr)

    const x = 40 + c * 60
    const y = size[1] - 40 - r * 18

    let value = cell.v

    if (isRed(cell)) {
      value = resolveDynamicValue(String(cell.v), project, regels)
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

/*
===========================================================
CALCULATIE REGELS (MEERPAGINA, DYNAMISCH)
===========================================================
*/
function renderCalculatieRegels({ pdf, font, regels }) {
  let page = pdf.addPage(A4_L)
  let y = A4_L[1] - 40

  for (const r of regels) {
    if (y < 40) {
      page = pdf.addPage(A4_L)
      y = A4_L[1] - 40
    }

    page.drawText(r.code || "", { x: 40, y, size: 8, font })
    page.drawText(r.omschrijving || "", { x: 100, y, size: 8, font })
    page.drawText(euro(r.totaal), { x: 740, y, size: 8, font })

    y -= 18
  }
}

/*
===========================================================
DYNAMIC VALUE RESOLVER (RODE CELLEN)
===========================================================
*/
function resolveDynamicValue(text, project, regels) {
  const t = text.toLowerCase()

  if (t.includes("opdrachtgever")) return project.opdrachtgever || ""
  if (t.includes("projectnaam")) return project.naam || ""
  if (t.includes("projectomschrijving")) return project.omschrijving || ""
  if (t.includes("plaats")) return project.plaatsnaam || ""
  if (t.includes("offertenummer")) return project.offertenummer || ""
  if (t.includes("datum")) return project.offertedatum || ""

  if (t.includes("aanneemsom")) {
    return euro(
      regels.reduce((s, r) => s + Number(r.totaal || 0), 0)
    )
  }

  return ""
}

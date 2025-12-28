import { createClient } from "@supabase/supabase-js"
import { PDFDocument, rgb, StandardFonts } from "pdf-lib"

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
)

/*
===========================================================
2JOURS PDF GENERATOR – PNG BACKGROUND (DEFINITIEF)
- Excel layout = PNG background
- PDF bestaat altijd
- Calculatie vult zich pas na rekenwolk
===========================================================
*/

const BUCKET = "sterkcalc"

const PNGS = {
  voorblad: "templates/2jours_voorblad.png",
  calculatie: "templates/2jours_calculatie.png",
  staartblad: "templates/2jours_staartblad.png"
}

const A4_P = [595, 842]
const A4_L = [842, 595]

function assert(cond, msg) {
  if (!cond) throw new Error(msg)
}

function euro(n) {
  return `€ ${Number(n || 0).toFixed(2)}`
}

async function loadPng(pdf, path) {
  const { data, error } = await supabase.storage
    .from(BUCKET)
    .download(path)

  assert(!error && data, `PNG_NOT_FOUND: ${path}`)

  const bytes = await data.arrayBuffer()
  return await pdf.embedPng(bytes)
}

function drawBackground(page, img) {
  page.drawImage(img, {
    x: 0,
    y: 0,
    width: page.getWidth(),
    height: page.getHeight()
  })
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

  const hasRegels = Array.isArray(regels) && regels.length > 0

  const pdf = await PDFDocument.create()
  const font = await pdf.embedFont(StandardFonts.Helvetica)

  /*
  ============================
  VOORBLAD
  ============================
  */
  const imgVoorblad = await loadPng(pdf, PNGS.voorblad)
  const pageVoorblad = pdf.addPage(A4_P)
  drawBackground(pageVoorblad, imgVoorblad)

  pageVoorblad.drawText(project.naam || "", {
    x: 50,
    y: 360,
    size: 11,
    font,
    color: rgb(0, 0, 0)
  })

  pageVoorblad.drawText(project.plaatsnaam || "", {
    x: 50,
    y: 340,
    size: 11,
    font
  })

  /*
  ============================
  CALCULATIEBLAD (MEERPAGINA)
  ============================
  */
  const imgCalc = await loadPng(pdf, PNGS.calculatie)

  let page = pdf.addPage(A4_L)
  drawBackground(page, imgCalc)

  let y = 360

  if (hasRegels) {
    for (const r of regels) {
      if (y < 80) {
        page = pdf.addPage(A4_L)
        drawBackground(page, imgCalc)
        y = 360
      }

      page.drawText(r.code || "", { x: 40, y, size: 8, font })
      page.drawText(r.omschrijving || "", { x: 120, y, size: 8, font })
      page.drawText(euro(r.totaal), { x: 760, y, size: 8, font })

      y -= 14
    }
  }

  /*
  ============================
  STAARTBLAD / TOTALEN
  ============================
  */
  const imgStaart = await loadPng(pdf, PNGS.staartblad)
  const pageStaart = pdf.addPage(A4_L)
  drawBackground(pageStaart, imgStaart)

  if (hasRegels) {
    const totaal = regels.reduce(
      (s, r) => s + Number(r.totaal || 0),
      0
    )

    pageStaart.drawText(euro(totaal), {
      x: 760,
      y: 160,
      size: 10,
      font
    })
  }

  /*
  ============================
  OPSLAAN
  ============================
  */
  const bytes = await pdf.save()
  const path = `${project_id}/offerte_2jours.pdf`

  await supabase.storage
    .from(BUCKET)
    .upload(path, bytes, {
      upsert: true,
      contentType: "application/pdf"
    })

  const pdfUrl =
    `${process.env.SUPABASE_URL}/storage/v1/object/public/${BUCKET}/${path}`

  await supabase
    .from("projects")
    .update({ pdf_url: pdfUrl })
    .eq("id", project_id)

  return { status: "DONE", pdf_url: pdfUrl }
}

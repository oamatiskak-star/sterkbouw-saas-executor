import { PDFDocument, StandardFonts, rgb } from "pdf-lib"
import { createClient } from "@supabase/supabase-js"

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
)

/*
===========================================================
2JOURS PDF GENERATOR – DEFINITIEF
===========================================================
*/

const A4_P = { w: 595, h: 842 }
const A4_L = { w: 842, h: 595 }

const MARGIN = 40
const LINE = 12
const SMALL = 8
const NORMAL = 10
const TITLE = 18

function euro(v) {
  return `€ ${Number(v || 0).toFixed(2)}`
}

function safeArray(v) {
  return Array.isArray(v) ? v : []
}

export async function generate2joursPdf(project_id) {
  if (!project_id) throw new Error("NO_PROJECT_ID")

  /*
  ============================
  PROJECT
  ============================
  */
  const { data: project } = await supabase
    .from("projects")
    .select("*")
    .eq("id", project_id)
    .single()

  if (!project) throw new Error("PROJECT_NOT_FOUND")

  /*
  ============================
  CALCULATIE DATA (LEIDEND)
  ============================
  */
  const { data: regelsRaw } = await supabase
    .from("v_calculatie_2jours")
    .select("*")
    .eq("project_id", project_id)
    .order("hoofdstuk_code")
    .order("subhoofdstuk_code")
    .order("code")

  const regels = safeArray(regelsRaw)

  /*
  ============================
  PDF INIT
  ============================
  */
  const pdf = await PDFDocument.create()
  const font = await pdf.embedFont(StandardFonts.Helvetica)

  const draw = (page, text, x, y, size = NORMAL) =>
    page.drawText(String(text ?? ""), {
      x,
      y,
      size,
      font,
      color: rgb(0, 0, 0)
    })

  /*
  ============================
  VOORBLAD
  ============================
  */
  let page = pdf.addPage([A4_P.w, A4_P.h])
  let y = A4_P.h - MARGIN

  draw(page, "2JOURS OFFERTE / CALCULATIE", 140, y, TITLE)
  y -= 40

  draw(page, `Project: ${project.naam || ""}`, MARGIN, y)
  y -= LINE
  draw(page, `Opdrachtgever: ${project.naam_opdrachtgever || ""}`, MARGIN, y)
  y -= LINE
  draw(page, `Adres: ${project.adres || ""}`, MARGIN, y)

  /*
  ============================
  CALCULATIE – LIGGEND
  ============================
  */
  page = pdf.addPage([A4_L.w, A4_L.h])
  y = A4_L.h - MARGIN

  const col = {
    code: 20,
    oms: 60,
    aant: 300,
    eenh: 335,
    norm: 370,
    uren: 405,
    loon: 445,
    prijs: 485,
    mat_eh: 525,
    mat: 565,
    oa: 605,
    stel: 645,
    tot: 685
  }

  function header() {
    draw(page, "code", col.code, y, SMALL)
    draw(page, "omschrijving", col.oms, y, SMALL)
    draw(page, "aantal", col.aant, y, SMALL)
    draw(page, "eenh.", col.eenh, y, SMALL)
    draw(page, "m.norm", col.norm, y, SMALL)
    draw(page, "uren", col.uren, y, SMALL)
    draw(page, "loonkosten", col.loon, y, SMALL)
    draw(page, "prijs/eh.", col.prijs, y, SMALL)
    draw(page, "materiaal", col.mat, y, SMALL)
    draw(page, "o.a.", col.oa, y, SMALL)
    draw(page, "stelposten", col.stel, y, SMALL)
    draw(page, "totaal", col.tot, y, SMALL)
    y -= LINE
  }

  header()

  let kostprijs = 0

  for (const r of regels) {
    if (y < 40) {
      page = pdf.addPage([A4_L.w, A4_L.h])
      y = A4_L.h - MARGIN
      header()
    }

    const totaal = Number(r.totaal || 0)
    kostprijs += totaal

    draw(page, r.code, col.code, y, SMALL)
    draw(page, r.omschrijving, col.oms, y, SMALL)
    draw(page, r.aantal, col.aant, y, SMALL)
    draw(page, r.eenheid, col.eenh, y, SMALL)
    draw(page, r.normuren, col.norm, y, SMALL)
    draw(page, r.uren, col.uren, y, SMALL)
    draw(page, euro(r.loonkosten), col.loon, y, SMALL)
    draw(page, euro(r.prijs_eenheid), col.prijs, y, SMALL)
    draw(page, euro(r.materiaalkosten), col.mat, y, SMALL)
    draw(page, euro(r.overig_algemeen), col.oa, y, SMALL)
    draw(page, euro(r.stelposten), col.stel, y, SMALL)
    draw(page, euro(totaal), col.tot, y, SMALL)

    y -= LINE
  }

  /*
  ============================
  OPSLAAN
  ============================
  */
  const bytes = await pdf.save()
  const path = `${project_id}/calculatie_2jours.pdf`

  await supabase.storage.from("sterkcalc").upload(path, bytes, {
    upsert: true,
    contentType: "application/pdf"
  })

  const pdfUrl =
    `${process.env.SUPABASE_URL}/storage/v1/object/public/sterkcalc/${path}`

  await supabase
    .from("projects")
    .update({ pdf_url: pdfUrl })
    .eq("id", project_id)

  return { status: "DONE", project_id, pdf_url: pdfUrl, kostprijs }
}

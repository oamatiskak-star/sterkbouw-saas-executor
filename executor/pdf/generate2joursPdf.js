// executor/pdf/generate2joursPdf.js
import { PDFDocument, StandardFonts, rgb } from "pdf-lib"
import { createClient } from "@supabase/supabase-js"

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
)

/*
===========================================================
2JOURS PDF GENERATOR – DEFINITIEF EINDPRODUCT
- GEEN templates
- layout = code
- dynamische pagination
- staand → liggend
- ALLE ketenstappen zichtbaar in PDF
===========================================================
*/

const A4_P = { w: 595, h: 842 }
const A4_L = { w: 842, h: 595 }

const MARGIN = 30
const LINE = 12
const SMALL = 8
const NORMAL = 11
const TITLE = 18

function euro(n) {
  return `€ ${Number(n || 0).toFixed(2)}`
}

function assert(cond, msg) {
  if (!cond) throw new Error(msg)
}

function draw(page, font, text, x, y, size = NORMAL) {
  page.drawText(String(text ?? ""), {
    x,
    y,
    size,
    font,
    color: rgb(0, 0, 0)
  })
}

export async function generate2joursPdf(project_id) {
  assert(project_id, "NO_PROJECT_ID")

  /*
  ===========================================================
  DATA – PROJECT
  ===========================================================
  */
  const { data: project } = await supabase
    .from("projects")
    .select("*")
    .eq("id", project_id)
    .single()
  assert(project, "PROJECT_NOT_FOUND")

  /*
  ===========================================================
  DATA – CALCULATIE (VOLLEDIGE 2JOURS VIEW)
  ===========================================================
  */
  const { data: regels = [] } = await supabase
    .from("v_calculatie_2jours")
    .select("*")
    .eq("project_id", project_id)
    .order("hoofdstuk_code")
    .order("subhoofdstuk_code")
    .order("code")

  /*
  ===========================================================
  PDF INIT
  ===========================================================
  */
  const pdf = await PDFDocument.create()
  const font = await pdf.embedFont(StandardFonts.Helvetica)

  /*
  ===========================================================
  VOORBLAD
  ===========================================================
  */
  let page = pdf.addPage([A4_P.w, A4_P.h])
  let y = A4_P.h - MARGIN

  draw(page, font, "2jours Offerte / Calculatie", 150, y, TITLE)
  y -= 50

  draw(page, font, `Project: ${project.naam || ""}`, MARGIN, y)
  y -= LINE
  draw(page, font, `Opdrachtgever: ${project.naam_opdrachtgever || ""}`, MARGIN, y)
  y -= LINE
  draw(page, font, `Adres: ${project.adres || ""} ${project.plaatsnaam || ""}`, MARGIN, y)
  y -= LINE * 2
  draw(page, font, project.opmerking || "-", MARGIN, y)

  /*
  ===========================================================
  CALCULATIE – LIGGEND
  ===========================================================
  */
  page = pdf.addPage([A4_L.w, A4_L.h])
  y = A4_L.h - MARGIN

  /*
  ===========================================================
  KOLOMMEN (EXACT JOUW DEFINITIE)
  ===========================================================
  */
  const col = {
    code: 20,
    oms: 70,
    aantal: 250,
    eenh: 290,
    mnorm: 330,
    uren: 370,
    loonkosten: 410,
    prijs_eenh: 460,
    materiaal: 510,
    oa_eenh: 565,
    oa: 615,
    stelp_eenh: 665,
    stelposten: 715,
    totaal: 785
  }

  function header() {
    draw(page, font, "Code", col.code, y, SMALL)
    draw(page, font, "Omschrijving", col.oms, y, SMALL)
    draw(page, font, "Aantal", col.aantal, y, SMALL)
    draw(page, font, "Eenh.", col.eenh, y, SMALL)
    draw(page, font, "M.norm", col.mnorm, y, SMALL)
    draw(page, font, "Uren", col.uren, y, SMALL)
    draw(page, font, "Loonkosten", col.loonkosten, y, SMALL)
    draw(page, font, "Prijs/eenh.", col.prijs_eenh, y, SMALL)
    draw(page, font, "Materiaal/-eel", col.materiaal, y, SMALL)
    draw(page, font, "O.A./eenh.", col.oa_eenh, y, SMALL)
    draw(page, font, "O.A.", col.oa, y, SMALL)
    draw(page, font, "Stelp/eenh.", col.stelp_eenh, y, SMALL)
    draw(page, font, "Stelposten", col.stelposten, y, SMALL)
    draw(page, font, "Totaal", col.totaal, y, SMALL)
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

    draw(page, font, r.code, col.code, y, SMALL)
    draw(page, font, r.omschrijving, col.oms, y, SMALL)
    draw(page, font, r.aantal, col.aantal, y, SMALL)
    draw(page, font, r.eenheid, col.eenh, y, SMALL)
    draw(page, font, r.normuren, col.mnorm, y, SMALL)
    draw(page, font, r.uren, col.uren, y, SMALL)
    draw(page, font, euro(r.loonkosten), col.loonkosten, y, SMALL)
    draw(page, font, euro(r.materiaalprijs), col.prijs_eenh, y, SMALL)
    draw(page, font, euro(r.materiaalkosten), col.materiaal, y, SMALL)
    draw(page, font, euro(r.oa_eenheidsprijs), col.oa_eenh, y, SMALL)
    draw(page, font, euro(r.oa_kosten), col.oa, y, SMALL)
    draw(page, font, euro(r.stelpost_eenheidsprijs), col.stelp_eenh, y, SMALL)
    draw(page, font, euro(r.stelposten), col.stelposten, y, SMALL)
    draw(page, font, euro(totaal), col.totaal, y, SMALL)

    y -= LINE
  }

  /*
  ===========================================================
  OPSLAAN – PUBLIC BUCKET
  ===========================================================
  */
  const bytes = await pdf.save()
  const path = `${project_id}/calculatie_2jours.pdf`

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

  return {
    status: "DONE",
    project_id,
    pdf_url: publicUrl,
    kostprijs
  }
}

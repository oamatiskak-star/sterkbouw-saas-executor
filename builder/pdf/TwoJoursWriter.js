import { PDFDocument, rgb, StandardFonts } from "pdf-lib"
import { createClient } from "@supabase/supabase-js"

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
)

/*
===========================================================
2JOURS PDF WRITER – EINDPRODUCT
- PNG = vaste achtergrond (NOOIT schalen)
- Alle kolommen gemapt conform PNG
- Afkappen binnen kolombreedte (geen wrapping)
- Automatische paginering (10 → 10.000+ regels)
- Eén keer renderen → opslaan → klaar
===========================================================
*/

const BUCKET = "sterkcalc"
const TEMPLATE = {
  voorblad:   "templates/2jours_voorblad.png",
  calculatie: "templates/2jours_calculatie.png",
  staartblad: "templates/2jours_staartblad.png"
}

// A4 landscape (moet matchen met PNG’s)
const A4_L = [842, 595]

// Paginering
const PAGE = {
  startY: 515,
  endY: 95,
  rowHeight: 12
}

// KOLOMMEN (X + breedte) — afgestemd op PNG
const COL = {
  code:        { x: 35,  w: 40 },
  omschrijving:{ x: 85,  w: 230 },
  aantal:      { x: 330, w: 28 },
  eenheid:     { x: 360, w: 28 },
  norm:        { x: 395, w: 28 },
  uren:        { x: 430, w: 28 },
  loonkosten:  { x: 480, w: 45 },
  prijs_eenh:  { x: 525, w: 45 },
  materiaal:   { x: 575, w: 45 },
  oa_perc:     { x: 630, w: 28 },
  oa:          { x: 660, w: 40 },
  stelp_eenh:  { x: 705, w: 40 },
  stelposten:  { x: 750, w: 40 },
  totaal:      { x: 795, w: 42 }
}

function euro(n) {
  return `€ ${Number(n || 0).toFixed(2)}`
}

// Tekst AFKAPPEN binnen kolombreedte
function drawClampedText(page, font, text, x, y, maxWidth, size = 8) {
  if (text === null || text === undefined) return
  let s = String(text)
  while (s.length > 0 && font.widthOfTextAtSize(s, size) > maxWidth) {
    s = s.slice(0, -1)
  }
  page.drawText(s, { x, y, size, font, color: rgb(0, 0, 0) })
}

export class TwoJoursWriter {
  constructor(project_id, pdf, font, images) {
    this.project_id = project_id
    this.pdf = pdf
    this.font = font
    this.images = images
  }

  /*
  ============================
  OPEN (laadt PNG’s 1×)
  ============================
  */
  static async open(project_id) {
    const pdf = await PDFDocument.create()
    const font = await pdf.embedFont(StandardFonts.Helvetica)

    const images = {}
    for (const key of Object.keys(TEMPLATE)) {
      const { data } = await supabase.storage
        .from(BUCKET)
        .download(TEMPLATE[key])
      const bytes = await data.arrayBuffer()
      images[key] = await pdf.embedPng(bytes)
    }

    return new TwoJoursWriter(project_id, pdf, font, images)
  }

  /*
  ============================
  VOORBLAD
  ============================
  */
  drawVoorblad(project) {
    const page = this.pdf.addPage(A4_L)
    page.drawImage(this.images.voorblad, {
      x: 0, y: 0, width: A4_L[0], height: A4_L[1]
    })

    const t = (v) => String(v || "")

    // Pas deze posities aan als jouw PNG exact anders is
    page.drawText(t(project.naam_opdrachtgever || project.opdrachtgever), {
      x: 85, y: 445, size: 9, font: this.font
    })
    page.drawText(t(project.naam || project.projectnaam), {
      x: 85, y: 415, size: 9, font: this.font
    })
    page.drawText(t(project.plaatsnaam || project.plaats), {
      x: 85, y: 385, size: 9, font: this.font
    })
  }

  /*
  ============================
  CALCULATIE (MULTIPAGE)
  ============================
  */
  drawCalculatieRegels(regels, totalen) {
    if (!Array.isArray(regels)) regels = []

    const maxRows = Math.floor(
      (PAGE.startY - PAGE.endY) / PAGE.rowHeight
    )

    let page
    let y = PAGE.startY
    let row = 0

    const newPage = () => {
      page = this.pdf.addPage(A4_L)
      page.drawImage(this.images.calculatie, {
        x: 0, y: 0, width: A4_L[0], height: A4_L[1]
      })
      y = PAGE.startY
      row = 0
    }

    newPage()

    for (const r of regels) {
      if (row >= maxRows) newPage()

      drawClampedText(page, this.font, r.stabu_code,      COL.code.x,        y, COL.code.w)
      drawClampedText(page, this.font, r.omschrijving,   COL.omschrijving.x,y, COL.omschrijving.w)
      drawClampedText(page, this.font, r.hoeveelheid,    COL.aantal.x,      y, COL.aantal.w)
      drawClampedText(page, this.font, r.eenheid,        COL.eenheid.x,     y, COL.eenheid.w)
      drawClampedText(page, this.font, r.normuren,       COL.norm.x,        y, COL.norm.w)
      drawClampedText(page, this.font, r.uren,           COL.uren.x,        y, COL.uren.w)
      drawClampedText(page, this.font, euro(r.loonkosten),COL.loonkosten.x, y, COL.loonkosten.w)
      drawClampedText(page, this.font, euro(r.prijs_eenh),COL.prijs_eenh.x, y, COL.prijs_eenh.w)
      drawClampedText(page, this.font, euro(r.materiaalprijs),COL.materiaal.x,y, COL.materiaal.w)
      drawClampedText(page, this.font, r.oa_perc,         COL.oa_perc.x,     y, COL.oa_perc.w)
      drawClampedText(page, this.font, euro(r.oa),        COL.oa.x,          y, COL.oa.w)
      drawClampedText(page, this.font, euro(r.stelp_eenh),COL.stelp_eenh.x, y, COL.stelp_eenh.w)
      drawClampedText(page, this.font, euro(r.stelposten),COL.stelposten.x, y, COL.stelposten.w)
      drawClampedText(page, this.font, euro(r.totaal),    COL.totaal.x,      y, COL.totaal.w)

      y -= PAGE.rowHeight
      row++
    }

    // Totalen (op laatste calculatiepagina)
    if (totalen) {
      drawClampedText(
        page,
        this.font,
        euro(totalen.kostprijs),
        COL.totaal.x,
        85,
        COL.totaal.w,
        9
      )
    }
  }

  /*
  ============================
  STAARTBLAD
  ============================
  */
  drawStaartblad() {
    const page = this.pdf.addPage(A4_L)
    page.drawImage(this.images.staartblad, {
      x: 0, y: 0, width: A4_L[0], height: A4_L[1]
    })
  }

  /*
  ============================
  SAVE
  ============================
  */
  async save() {
    const bytes = await this.pdf.save()
    const path = `${this.project_id}/offerte_2jours.pdf`

    await supabase.storage
      .from(BUCKET)
      .upload(path, {
        contentType: "application/pdf",
        upsert: true
      }, bytes)

    return `${process.env.SUPABASE_URL}/storage/v1/object/public/${BUCKET}/${path}`
  }
}

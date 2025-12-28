import { PDFDocument, rgb, StandardFonts } from "pdf-lib"
import { createClient } from "@supabase/supabase-js"

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
)

/*
===========================================================
2JOURS PDF WRITER – PRODUCTIEVERSIE
- PNG = vaste achtergrond (NOOIT schalen)
- calculatieregels = pagineren
- ondersteunt 10 → 10.000 regels
===========================================================
*/

const BUCKET = "sterkcalc"
const TEMPLATE = {
  voorblad: "templates/2jours_voorblad.png",
  calculatie: "templates/2jours_calculatie.png",
  staartblad: "templates/2jours_staartblad.png"
}

const A4_L = [842, 595]

const PAGE = {
  startY: 515,
  endY: 95,
  rowHeight: 12
}

const COL = {
  code: 35,
  omschrijving: 85,
  aantal: 330,
  eenheid: 360,
  norm: 395,
  uren: 430,
  loonkosten: 480,
  materiaal: 535,
  totaal: 615
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
  OPEN
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
      x: 0,
      y: 0,
      width: A4_L[0],
      height: A4_L[1]
    })

    const t = (v) => String(v || "")

    page.drawText(t(project.opdrachtgever), { x: 85, y: 445, size: 9, font: this.font })
    page.drawText(t(project.naam), { x: 85, y: 415, size: 9, font: this.font })
    page.drawText(t(project.plaatsnaam), { x: 85, y: 385, size: 9, font: this.font })
  }

  /*
  ============================
  CALCULATIE REGELS (PAGINERING)
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
        x: 0,
        y: 0,
        width: A4_L[0],
        height: A4_L[1]
      })
      y = PAGE.startY
      row = 0
    }

    newPage()

    for (const r of regels) {
      if (row >= maxRows) newPage()

      page.drawText(String(r.stabu_code || ""), { x: COL.code, y, size: 8, font: this.font })
      page.drawText(String(r.omschrijving || ""), { x: COL.omschrijving, y, size: 8, font: this.font })
      page.drawText(String(r.hoeveelheid ?? ""), { x: COL.aantal, y, size: 8, font: this.font })
      page.drawText(String(r.eenheid || ""), { x: COL.eenheid, y, size: 8, font: this.font })
      page.drawText(String(r.normuren ?? ""), { x: COL.norm, y, size: 8, font: this.font })
      page.drawText(String(r.uren ?? ""), { x: COL.uren, y, size: 8, font: this.font })
      page.drawText(`€ ${Number(r.loonkosten || 0).toFixed(2)}`, { x: COL.loonkosten, y, size: 8, font: this.font })
      page.drawText(`€ ${Number(r.materiaalprijs || 0).toFixed(2)}`, { x: COL.materiaal, y, size: 8, font: this.font })
      page.drawText(`€ ${Number(r.totaal || 0).toFixed(2)}`, { x: COL.totaal, y, size: 8, font: this.font })

      y -= PAGE.rowHeight
      row++
    }

    if (totalen) {
      page.drawText(`€ ${Number(totalen.kostprijs || 0).toFixed(2)}`, {
        x: COL.totaal,
        y: 85,
        size: 9,
        font: this.font
      })
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
      x: 0,
      y: 0,
      width: A4_L[0],
      height: A4_L[1]
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
      .upload(path, bytes, { upsert: true, contentType: "application/pdf" })

    return `${process.env.SUPABASE_URL}/storage/v1/object/public/${BUCKET}/${path}`
  }
}

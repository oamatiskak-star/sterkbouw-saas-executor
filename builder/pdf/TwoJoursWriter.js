import { createClient } from "@supabase/supabase-js"
import pkg from "pdf-lib"

const { PDFDocument, rgb, StandardFonts } = pkg

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
)

/*
===========================================================
2JOURS PDF WRITER – DEFINITIEF
- enige PDF-logica in het systeem
- vaste structuur
- vaste oriëntatie
- vaste secties
===========================================================
*/

export class TwoJoursWriter {
  constructor(project_id, pdf, font) {
    this.project_id = project_id
    this.pdf = pdf
    this.font = font
    this.sections = {}
    this.pages = {
      cover: null,
      opdracht: null,
      calculatie: []
    }
  }

  /*
  ============================
  OPEN / CREATE PDF
  ============================
  */
  static async open(project_id) {
    const path = `${project_id}/calculatie_2jours.pdf`

    let pdf = null
    let isExisting = false

    try {
      const { data } = await supabase.storage
        .from("sterkcalc")
        .download(path)

      if (data) {
        const bytes = await data.arrayBuffer()
        pdf = await PDFDocument.load(bytes)
        isExisting = true
      }
    } catch (_) {}

    if (!pdf) {
      pdf = await PDFDocument.create()
    }

    const font = await pdf.embedFont(StandardFonts.Helvetica)
    const writer = new TwoJoursWriter(project_id, pdf, font)

    if (isExisting) {
      writer._mapExistingPages()
    } else {
      writer._ensureBasePages()
    }

    return writer
  }

  /*
  ============================
  MAP BESTAANDE PAGINA’S
  ============================
  */
  _mapExistingPages() {
    const pages = this.pdf.getPages()

    this.pages.cover = pages[0] || null
    this.pages.opdracht = pages[1] || null

    this.pages.calculatie = []
    for (let i = 2; i < pages.length; i++) {
      this.pages.calculatie.push(pages[i])
    }

    if (this.pages.calculatie.length === 0) {
      const page = this.pdf.addPage([842, 595])
      this.pages.calculatie.push(page)
    }
  }

  /*
  ============================
  BASIS PAGINA’S (NIEUW)
  ============================
  */
  _ensureBasePages() {
    this.pages.cover = this.pdf.addPage([595, 842])
    this._drawCover()

    this.pages.opdracht = this.pdf.addPage([595, 842])
    this._drawOpdracht()

    const page = this.pdf.addPage([842, 595])
    this.pages.calculatie.push(page)
  }

  _drawCover() {
    const p = this.pages.cover
    p.drawText("2jours Offerte", {
      x: 200,
      y: 780,
      size: 20,
      font: this.font,
      color: rgb(0, 0, 0)
    })
    p.drawText(`Project: ${this.project_id}`, {
      x: 50,
      y: 720,
      size: 12,
      font: this.font
    })
  }

  _drawOpdracht() {
    const p = this.pages.opdracht
    p.drawText("Opdrachtbevestiging", {
      x: 50,
      y: 780,
      size: 16,
      font: this.font
    })
    p.drawText(
      "Deze offerte betreft de volledige calculatie conform STABU-systematiek.",
      { x: 50, y: 740, size: 11, font: this.font }
    )
  }

  /*
  ============================
  SCHRIJVEN NAAR SECTIES
  ============================
  */
  async writeSection(key, payload) {
    this.sections[key] = payload
  }

  /*
  ============================
  RENDER CALCULATIE
  ============================
  */
  _renderCalculatie() {
    let page = this.pages.calculatie[0]
    let y = 550

    const draw = (t, x, y, size = 9) =>
      page.drawText(String(t), {
        x,
        y,
        size,
        font: this.font,
        color: rgb(0, 0, 0)
      })

    if (this.sections["upload.bestanden"]) {
      draw("Aangeleverde documenten", 40, y, 11)
      y -= 16
      this.sections["upload.bestanden"].bestanden.forEach(b => {
        draw(`- ${b.filename}`, 50, y)
        y -= 12
      })
      y -= 20
    }

    if (this.sections["scan.resultaat"]) {
      draw("Scanresultaten", 40, y, 11)
      y -= 16
      draw(this.sections["scan.resultaat"].resultaat.samenvatting, 50, y)
      y -= 20
    }

    if (this.sections["stabu.basis"]) {
      draw("STABU basis", 40, y, 11)
      y -= 16
      this.sections["stabu.basis"].regels.forEach(r => {
        draw(`${r.code} – ${r.omschrijving}`, 50, y)
        y -= 12
      })
      y -= 20
    }

    if (this.sections["stabu.invulling"]) {
      draw("Projectinvulling", 40, y, 11)
      y -= 16
      this.sections["stabu.invulling"].regels.forEach(r => {
        draw(
          `${r.stabu_code} | ${r.hoeveelheid} × ${r.eenheidsprijs} = ${r.subtotaal}`,
          50,
          y
        )
        y -= 12
      })

      y -= 16
      draw(
        `Kostprijs: ${this.sections["stabu.invulling"].totalen.kostprijs}`,
        50,
        y
      )
      y -= 12
      draw(
        `Verkoopprijs: ${this.sections["stabu.invulling"].totalen.verkoopprijs}`,
        50,
        y
      )
    }
  }

  /*
  ============================
  OPSLAAN
  ============================
  */
  async save() {
    this._renderCalculatie()
    const bytes = await this.pdf.save()

    await supabase.storage
      .from("sterkcalc")
      .upload(
        `${this.project_id}/calculatie_2jours.pdf`,
        bytes,
        { upsert: true, contentType: "application/pdf" }
      )
  }

  /*
  ============================
  FINALIZE + SIGNED URL
  ============================
  */
  async finalize() {
    this._renderCalculatie()
    const bytes = await this.pdf.save()

    const path = `${this.project_id}/calculatie_2jours.pdf`

    await supabase.storage
      .from("sterkcalc")
      .upload(path, bytes, {
        upsert: true,
        contentType: "application/pdf"
      })

    const { data } = await supabase.storage
      .from("sterkcalc")
      .createSignedUrl(path, 3600)

    return data?.signedUrl || null
  }
}

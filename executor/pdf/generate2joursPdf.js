import { createClient } from "@supabase/supabase-js"
import { PDFDocument, rgb, StandardFonts } from "pdf-lib"
import fetch from "node-fetch"

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
)

/*
===========================================================
2JOURS PDF GENERATOR – STABIELE EINDVERSIE
- PNG templates als full-page background
- Tekst absoluut gepositioneerd
- Lege regels toegestaan
===========================================================
*/

async function loadImage(pdf, url) {
  const res = await fetch(url)
  const buf = await res.arrayBuffer()
  return pdf.embedPng(buf)
}

export default async function generate2joursPdf(task) {
  const { project_id, id: task_id } = task
  if (!project_id) throw new Error("NO_PROJECT_ID")

  const pdf = await PDFDocument.create()
  const font = await pdf.embedFont(StandardFonts.Helvetica)

  /*
  ===========================================================
  DATA OPHALEN
  ===========================================================
  */
  const { data: project } = await supabase
    .from("projects")
    .select("*")
    .eq("id", project_id)
    .single()

  const { data: regelsRaw } = await supabase
    .from("v_calculatie_2jours")
    .select("*")
    .eq("project_id", project_id)

  const regels = Array.isArray(regelsRaw) ? regelsRaw : []

  /*
  ===========================================================
  TEMPLATE URLS (SUPABASE STORAGE)
  ===========================================================
  */
  const base = `${process.env.SUPABASE_URL}/storage/v1/object/public/sterkcalc/templates`

  const tplVoorblad = `${base}/2jours_voorblad.png`
  const tplCalc = `${base}/2jours_calculatie.png`
  const tplStaart = `${base}/2jours_staartblad.png`

  /*
  ===========================================================
  PAGINA 1 – VOORBLAD
  ===========================================================
  */
  {
    const page = pdf.addPage([595, 842]) // A4
    const bg = await loadImage(pdf, tplVoorblad)
    page.drawImage(bg, { x: 0, y: 0, width: 595, height: 842 })

    // NAW – ABSOLUUT (exact onder elkaar)
    let y = 620
    const lh = 14

    const lines = [
      project?.naam_opdrachtgever,
      project?.adres,
      project?.postcode,
      project?.plaats
    ].filter(Boolean)

    for (const line of lines) {
      page.drawText(String(line), {
        x: 60,
        y,
        size: 10,
        font,
        color: rgb(0, 0, 0)
      })
      y -= lh
    }
  }

  /*
  ===========================================================
  PAGINA 2 – CALCULATIEREGELS
  ===========================================================
  */
  {
    const page = pdf.addPage([595, 842])
    const bg = await loadImage(pdf, tplCalc)
    page.drawImage(bg, { x: 0, y: 0, width: 595, height: 842 })

    let y = 650
    const rowH = 12

    for (const r of regels) {
      page.drawText(String(r.code || ""), { x: 40, y, size: 8, font })
      page.drawText(String(r.omschrijving || ""), { x: 80, y, size: 8, font })
      page.drawText(String(r.aantal || ""), { x: 300, y, size: 8, font })
      page.drawText(`€ ${r.totaal || "0,00"}`, { x: 460, y, size: 8, font })
      y -= rowH
      if (y < 80) break
    }
  }

  /*
  ===========================================================
  PAGINA 3 – STAARTBLAD
  ===========================================================
  */
  {
    const page = pdf.addPage([595, 842])
    const bg = await loadImage(pdf, tplStaart)
    page.drawImage(bg, { x: 0, y: 0, width: 595, height: 842 })
  }

  /*
  ===========================================================
  OPSLAAN
  ===========================================================
  */
  const pdfBytes = await pdf.save()

  const path = `pdf/${project_id}/offerte_2jours.pdf`

  await supabase.storage
    .from("sterkcalc")
    .upload(path, pdfBytes, {
      contentType: "application/pdf",
      upsert: true
    })

  const pdfUrl = `${process.env.SUPABASE_URL}/storage/v1/object/public/sterkcalc/${path}`

  await supabase
    .from("projects")
    .update({ pdf_url: pdfUrl })
    .eq("id", project_id)

  await supabase
    .from("executor_tasks")
    .update({ status: "completed" })
    .eq("id", task_id)

  return { pdf_url: pdfUrl }
}

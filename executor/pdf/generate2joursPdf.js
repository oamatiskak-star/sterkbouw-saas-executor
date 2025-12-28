import { createClient } from "@supabase/supabase-js"
import { PDFDocument, rgb, StandardFonts } from "pdf-lib"

/*
===========================================================
2JOURS PDF GENERATOR – STABIELE BASIS (PNG BACKGROUND)
- Node 18+ compatible (geen node-fetch)
- PNG templates als full-page background
- Absolute positionering
- Crash-vrij
===========================================================
*/

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
)

/*
===========================================================
UTILS
===========================================================
*/
async function loadImage(pdf, url) {
  if (!global.fetch) {
    throw new Error("FETCH_NOT_AVAILABLE")
  }

  const res = await fetch(url)
  if (!res.ok) {
    throw new Error(`IMAGE_LOAD_FAILED: ${url}`)
  }

  const buf = await res.arrayBuffer()
  return pdf.embedPng(buf)
}

function assert(cond, msg) {
  if (!cond) throw new Error(msg)
}

/*
===========================================================
MAIN
===========================================================
*/
export default async function generate2joursPdf(task) {
  assert(task, "TASK_MISSING")

  const project_id =
    task.project_id ||
    task.payload?.project_id ||
    null

  const task_id = task.id || null

  assert(project_id, "NO_PROJECT_ID")

  /*
  ===========================================================
  DATA OPHALEN
  ===========================================================
  */
  const { data: project, error: projErr } = await supabase
    .from("projects")
    .select("*")
    .eq("id", project_id)
    .single()

  if (projErr || !project) {
    throw new Error("PROJECT_NOT_FOUND")
  }

  const { data: regelsRaw, error: regelsErr } = await supabase
    .from("v_calculatie_2jours")
    .select("*")
    .eq("project_id", project_id)
    .order("code")

  if (regelsErr) {
    throw new Error("CALCULATIE_REGELS_INVALID")
  }

  const regels = Array.isArray(regelsRaw) ? regelsRaw : []

  /*
  ===========================================================
  PDF INIT
  ===========================================================
  */
  const pdf = await PDFDocument.create()
  const font = await pdf.embedFont(StandardFonts.Helvetica)

  /*
  ===========================================================
  TEMPLATE URLS (SUPABASE STORAGE – PUBLIC)
  ===========================================================
  */
  const base =
    `${process.env.SUPABASE_URL}/storage/v1/object/public/sterkcalc/templates`

  const tplVoorblad = `${base}/2jours_voorblad.png`
  const tplCalc     = `${base}/2jours_calculatie.png`
  const tplStaart   = `${base}/2jours_staartblad.png`

  /*
  ===========================================================
  PAGINA 1 – VOORBLAD
  ===========================================================
  */
  {
    const page = pdf.addPage([595, 842]) // A4 portrait
    const bg = await loadImage(pdf, tplVoorblad)

    page.drawImage(bg, {
      x: 0,
      y: 0,
      width: 595,
      height: 842
    })

    let y = 620
    const lh = 14

    const lines = [
      project.naam_opdrachtgever,
      project.adres,
      project.postcode,
      project.plaats
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
  PAGINA 2 – CALCULATIEREGELS (1e pagina)
  ===========================================================
  NB: multipage komt hierna, dit is stabiele basis
  ===========================================================
  */
  {
    const page = pdf.addPage([842, 595]) // A4 landscape
    const bg = await loadImage(pdf, tplCalc)

    page.drawImage(bg, {
      x: 0,
      y: 0,
      width: 842,
      height: 595
    })

    let y = 500
    const rowH = 12

    for (const r of regels) {
      if (y < 90) break

      page.drawText(String(r.code || ""),          { x: 40,  y, size: 8, font })
      page.drawText(String(r.omschrijving || ""), { x: 90,  y, size: 8, font })
      page.drawText(String(r.aantal || ""),        { x: 420, y, size: 8, font })
      page.drawText(
        `€ ${Number(r.totaal || 0).toFixed(2)}`,
        { x: 720, y, size: 8, font }
      )

      y -= rowH
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

    page.drawImage(bg, {
      x: 0,
      y: 0,
      width: 595,
      height: 842
    })
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

  const pdfUrl =
    `${process.env.SUPABASE_URL}/storage/v1/object/public/sterkcalc/${path}`

  await supabase
    .from("projects")
    .update({ pdf_url: pdfUrl })
    .eq("id", project_id)

  if (task_id) {
    await supabase
      .from("executor_tasks")
      .update({
        status: "completed",
        finished_at: new Date().toISOString()
      })
      .eq("id", task_id)
  }

  return { pdf_url: pdfUrl }
}

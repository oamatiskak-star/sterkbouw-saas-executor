// executor/pdf/generate2joursPdf.js - UPDATED VERSION
import { createClient } from "@supabase/supabase-js"
import { PDFDocument, rgb, StandardFonts } from "pdf-lib"

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
)

/*
===========================================================
2JOURS PDF GENERATOR – COMPATIBLE BOTH SIGNATURES
- Accepteert zowel (project_id) als (task)
- Backward compatible
===========================================================
*/

function assert(cond, msg) {
  if (!cond) throw new Error(msg)
}

async function loadImage(pdf, url) {
  const res = await fetch(url)
  if (!res.ok) throw new Error(`IMAGE_LOAD_FAILED: ${url}`)
  const buf = await res.arrayBuffer()
  return pdf.embedPng(buf)
}

function euro(n) {
  return `€ ${Number(n || 0).toFixed(2)}`
}

function drawClampedText(page, font, text, x, y, maxWidth, size = 8) {
  if (!text && text !== 0) return
  let s = String(text)
  while (font.widthOfTextAtSize(s, size) > maxWidth && s.length > 0) {
    s = s.slice(0, -1)
  }
  page.drawText(s, { x, y, size, font, color: rgb(0, 0, 0) })
}

/*
===========================================================
MAIN FUNCTION – ACCEPTEERT BEIDE SIGNATURES
===========================================================
*/
export async function generate2joursPdf(input) {
  console.log("[2JOURS_PDF] Called with:", 
    typeof input === 'string' ? `project_id: ${input}` : `task: ${input?.id}`
  )
  
  // BEPAAL INPUT TYPE
  let project_id, task_id, payload
  
  if (typeof input === 'string') {
    // Oude signature: generate2joursPdf(project_id)
    project_id = input
    task_id = null
    payload = {}
  } else if (input && typeof input === 'object') {
    // Nieuwe signature: generate2joursPdf(task)
    project_id = input.project_id || input.payload?.project_id
    task_id = input.id || null
    payload = input.payload || {}
  } else {
    throw new Error("INVALID_INPUT: generate2joursPdf expects string(project_id) or object(task)")
  }
  
  assert(project_id, "NO_PROJECT_ID")

  /*
  ============================
  DATA FETCH
  ============================
  */
  const { data: project, error: projectError } = await supabase
    .from("projects")
    .select("*")
    .eq("id", project_id)
    .single()

  if (projectError) {
    console.error("[2JOURS_PDF] Project fetch error:", projectError)
    throw new Error(`PROJECT_NOT_FOUND: ${project_id}`)
  }

  // HAAL REGELS OP (v_calculatie_2jours of fallback)
  let regels = []
  try {
    const { data: regelsRaw, error: regelsError } = await supabase
      .from("v_calculatie_2jours")
      .select("*")
      .eq("project_id", project_id)
      .order("code")
    
    if (!regelsError && Array.isArray(regelsRaw)) {
      regels = regelsRaw
    }
  } catch (viewError) {
    console.warn("[2JOURS_PDF] View v_calculatie_2jours not available, trying fallback")
    
    // FALLBACK: probeer calculatie_regels
    const { data: fallbackRegels } = await supabase
      .from("calculatie_regels")
      .select("*")
      .eq("project_id", project_id)
      .order("volgorde", { ascending: true })
      .then(res => res.data || [])
      .catch(() => [])
    
    regels = fallbackRegels.map(r => ({
      code: r.stabu_code,
      omschrijving: r.omschrijving,
      aantal: r.hoeveelheid,
      eenheid: r.eenheid,
      norm: r.normuren,
      uren: r.uren,
      loonkosten: r.loonkosten,
      prijs_eenh: r.prijs_eenh,
      materiaal_eenh: r.materiaalprijs,
      oa_perc: r.oa_perc,
      oa: r.oa,
      stelp_eenh: r.stelp_eenh,
      stelposten: r.stelposten,
      totaal: r.totaal
    }))
  }

  console.log(`[2JOURS_PDF] Found ${regels.length} regels for project ${project_id}`)

  /*
  ============================
  PDF INIT
  ============================
  */
  const pdf = await PDFDocument.create()
  const font = await pdf.embedFont(StandardFonts.Helvetica)

  /*
  ============================
  TEMPLATES
  ============================
  */
  const base = `${process.env.SUPABASE_URL}/storage/v1/object/public/sterkcalc/templates`
  const tplVoorblad = `${base}/2jours_voorblad.png`
  const tplCalc     = `${base}/2jours_calculatie.png`
  const tplStaart   = `${base}/2jours_staartblad.png`

  /*
  ============================
  VOORBLAD
  ============================
  */
  {
    const page = pdf.addPage([595, 842])  // A4 portrait
    
    try {
      const bg = await loadImage(pdf, tplVoorblad)
      page.drawImage(bg, { x: 0, y: 0, width: 595, height: 842 })
    } catch (bgError) {
      console.warn("[2JOURS_PDF] Could not load voorblad template, drawing blank")
    }

    let y = 620
    const lh = 14

    const lines = [
      project.naam_opdrachtgever || project.opdrachtgever,
      project.adres,
      project.postcode,
      project.plaatsnaam || project.plaats
    ].filter(Boolean)

    for (const line of lines) {
      page.drawText(String(line), {
        x: 60,
        y,
        size: 10,
        font
      })
      y -= lh
    }
  }

  /*
  ============================
  CALCULATIE – MULTIPAGE
  ============================
  */
  const PAGE = {
    width: 842,   // A4 landscape
    height: 595,
    startY: 500,
    endY: 90,
    rowH: 12
  }

  const COL = {
    code:        { x: 40,  w: 45 },
    omschrijving:{ x: 90,  w: 200 },
    aantal:      { x: 310, w: 35 },
    eenheid:     { x: 350, w: 35 },
    norm:        { x: 390, w: 35 },
    uren:        { x: 430, w: 35 },
    loonkosten:  { x: 470, w: 45 },
    prijs:       { x: 520, w: 45 },
    materiaal:   { x: 575, w: 45 },
    oa_perc:     { x: 635, w: 35 },
    oa:          { x: 675, w: 35 },
    stelp_prijs: { x: 715, w: 35 },
    stelposten:  { x: 760, w: 35 },
    totaal:      { x: 810, w: 60 }
  }

  let page
  let y

  async function newCalcPage() {
    page = pdf.addPage([PAGE.width, PAGE.height])
    
    try {
      const bg = await loadImage(pdf, tplCalc)
      page.drawImage(bg, {
        x: 0,
        y: 0,
        width: PAGE.width,
        height: PAGE.height
      })
    } catch (bgError) {
      console.warn("[2JOURS_PDF] Could not load calculatie template")
    }
    
    y = PAGE.startY
  }

  await newCalcPage()

  for (const r of regels) {
    if (y < PAGE.endY) {
      await newCalcPage()
    }

    drawClampedText(page, font, r.code, COL.code.x, y, COL.code.w)
    drawClampedText(page, font, r.omschrijving, COL.omschrijving.x, y, COL.omschrijving.w)
    drawClampedText(page, font, r.aantal, COL.aantal.x, y, COL.aantal.w)
    drawClampedText(page, font, r.eenheid, COL.eenheid.x, y, COL.eenheid.w)
    drawClampedText(page, font, r.norm, COL.norm.x, y, COL.norm.w)
    drawClampedText(page, font, r.uren, COL.uren.x, y, COL.uren.w)
    drawClampedText(page, font, euro(r.loonkosten), COL.loonkosten.x, y, COL.loonkosten.w)
    drawClampedText(page, font, euro(r.prijs_eenh), COL.prijs.x, y, COL.prijs.w)
    drawClampedText(page, font, euro(r.materiaal_eenh), COL.materiaal.x, y, COL.materiaal.w)
    drawClampedText(page, font, r.oa_perc, COL.oa_perc.x, y, COL.oa_perc.w)
    drawClampedText(page, font, euro(r.oa), COL.oa.x, y, COL.oa.w)
    drawClampedText(page, font, euro(r.stelp_eenh), COL.stelp_prijs.x, y, COL.stelp_prijs.w)
    drawClampedText(page, font, euro(r.stelposten), COL.stelposten.x, y, COL.stelposten.w)
    drawClampedText(page, font, euro(r.totaal), COL.totaal.x, y, COL.totaal.w)

    y -= PAGE.rowH
  }

  /*
  ============================
  STAARTBLAD
  ============================
  */
  {
    const page = pdf.addPage([595, 842])
    
    try {
      const bg = await loadImage(pdf, tplStaart)
      page.drawImage(bg, { x: 0, y: 0, width: 595, height: 842 })
    } catch (bgError) {
      console.warn("[2JOURS_PDF] Could not load staartblad template")
    }
  }

  /*
  ============================
  OPSLAAN
  ============================
  */
  const pdfBytes = await pdf.save()
  const path = `pdf/${project_id}/offerte_2jours.pdf`

  const { error: uploadError } = await supabase.storage
    .from("sterkcalc")
    .upload(path, pdfBytes, {
      contentType: "application/pdf",
      upsert: true
    })

  if (uploadError) {
    console.error("[2JOURS_PDF] Upload failed:", uploadError)
    throw new Error(`PDF_UPLOAD_FAILED: ${uploadError.message}`)
  }

  const pdfUrl = `${process.env.SUPABASE_URL}/storage/v1/object/public/sterkcalc/${path}`

  // UPDATE PROJECT
  await supabase
    .from("projects")
    .update({ 
      pdf_url: pdfUrl,
      pdf_generated_at: new Date().toISOString()
    })
    .eq("id", project_id)

  // UPDATE TASK INDien beschikbaar
  if (task_id) {
    await supabase
      .from("executor_tasks")
      .update({
        status: "completed",
        finished_at: new Date().toISOString()
      })
      .eq("id", task_id)
  }

  console.log("[2JOURS_PDF] Generated successfully:", pdfUrl)
  
  return { 
    success: true, 
    pdf_url: pdfUrl,
    project_id,
    regels_count: regels.length
  }
}

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
- alle ketenstappen zichtbaar in PDF
===========================================================
*/

const A4_P = { w: 595, h: 842 }   // staand
const A4_L = { w: 842, h: 595 }   // liggend

const MARGIN = 40
const LINE = 12
const SMALL = 9
const NORMAL = 11
const TITLE = 18

function euro(n) {
  return `€ ${Number(n || 0).toFixed(2)}`
}

function assert(cond, msg) {
  if (!cond) throw new Error(msg)
}

export async function generate2joursPdf(project_id) {
  assert(project_id, "NO_PROJECT_ID")

  /*
  ============================
  DATA – PROJECT
  ============================
  */
  const { data: project } = await supabase
    .from("projects")
    .select("*")
    .eq("id", project_id)
    .single()

  assert(project, "PROJECT_NOT_FOUND")

  /*
  ============================
  DATA – CALCULATIE VIEW
  ============================
  */
  const { data: regels = [] } = await supabase
    .from("v_calculatie_2jours")
    .select("*")
    .eq("project_id", project_id)
    .order("hoofdstuk_code")
    .order("subhoofdstuk_code")
    .order("code")

  /*
  ============================
  DATA – STELPOSTEN / CORRECTIES / UURLONEN
  ============================
  */
  const { data: stelposten = [] } =
    await supabase.from("calculatie_stelposten").select("*").eq("project_id", project_id)

  const { data: correcties } =
    await supabase.from("calculatie_correcties").select("*").eq("project_id", project_id).single()

  const { data: uurlonen = [] } =
    await supabase.from("calculatie_uurloon_overrides").select("*").eq("project_id", project_id)

  /*
  ============================
  DATA – UPLOADS & SCAN (OPTIONEEL)
  ============================
  */
  const { data: files = [] } =
    await supabase.from("project_files").select("file_name").eq("project_id", project_id)

  const { data: scanlog } =
    await supabase
      .from("project_initialization_log")
      .select("*")
      .eq("project_id", project_id)
      .order("created_at", { ascending: true })

  /*
  ============================
  PDF INIT
  ============================
  */
  const pdf = await PDFDocument.create()
  const font = await pdf.embedFont(StandardFonts.Helvetica)

  /*
  ============================
  HELPERS
  ============================
  */
  const drawText = (page, t, x, y, size = NORMAL) =>
    page.drawText(String(t ?? ""), { x, y, size, font, color: rgb(0, 0, 0) })

  /*
  ===========================================================
  VOORBLAD (STAAND – DYNAMISCH)
  ===========================================================
  */
  let page = pdf.addPage([A4_P.w, A4_P.h])
  let y = A4_P.h - MARGIN

  drawText(page, "2jours Offerte / Calculatie", 160, y, 20)
  y -= 50

  drawText(page, `Project: ${project.naam || ""}`, MARGIN, y)
  y -= LINE
  drawText(page, `Opdrachtgever: ${project.naam_opdrachtgever || ""}`, MARGIN, y)
  y -= LINE
  drawText(page, `Adres: ${project.adres || ""} ${project.plaatsnaam || ""}`, MARGIN, y)
  y -= LINE
  drawText(page, `Telefoon: ${project.telefoon || ""}`, MARGIN, y)
  y -= LINE * 2

  drawText(page, "Omschrijving:", MARGIN, y, 12)
  y -= LINE
  drawText(page, project.opmerking || "-", MARGIN, y)

  /*
  ===========================================================
  OPDRACHTBEVESTIGING (STAAND)
  ===========================================================
  */
  page = pdf.addPage([A4_P.w, A4_P.h])
  y = A4_P.h - MARGIN

  drawText(page, "Opdrachtbevestiging", MARGIN, y, TITLE)
  y -= 40

  drawText(
    page,
    "Deze offerte betreft de volledige calculatie conform STABU-systematiek en bijbehorende uitgangspunten.",
    MARGIN,
    y
  )

  /*
  ===========================================================
  UPLOAD OVERZICHT
  ===========================================================
  */
  if (files.length) {
    y -= 40
    drawText(page, "Aangeleverde documenten", MARGIN, y, 14)
    y -= 20

    files.forEach(f => {
      if (y < 60) {
        page = pdf.addPage([A4_P.w, A4_P.h])
        y = A4_P.h - MARGIN
      }
      drawText(page, `- ${f.file_name}`, MARGIN, y, SMALL)
      y -= LINE
    })
  }

  /*
  ===========================================================
  SCAN RESULTAAT (LOG)
  ===========================================================
  */
  if (scanlog && scanlog.length) {
    page = pdf.addPage([A4_P.w, A4_P.h])
    y = A4_P.h - MARGIN

    drawText(page, "Analyse & Scan", MARGIN, y, TITLE)
    y -= 30

    scanlog.forEach(l => {
      if (y < 60) {
        page = pdf.addPage([A4_P.w, A4_P.h])
        y = A4_P.h - MARGIN
      }
      drawText(
        page,
        `${l.module}: ${l.status}`,
        MARGIN,
        y,
        SMALL
      )
      y -= LINE
    })
  }

  /*
  ===========================================================
  CALCULATIE (LIGGEND – DYNAMISCH)
  ===========================================================
  */
  page = pdf.addPage([A4_L.w, A4_L.h])
  y = A4_L.h - MARGIN

  const col = {
    code: 30,
    oms: 90,
    aant: 340,
    eenh: 380,
    norm: 420,
    loon: 470,
    mat: 520,
    tot: 600
  }

  function header() {
    drawText(page, "Code", col.code, y, SMALL)
    drawText(page, "Omschrijving", col.oms, y, SMALL)
    drawText(page, "Aantal", col.aant, y, SMALL)
    drawText(page, "Eenh", col.eenh, y, SMALL)
    drawText(page, "Norm", col.norm, y, SMALL)
    drawText(page, "Loon", col.loon, y, SMALL)
    drawText(page, "Materiaal", col.mat, y, SMALL)
    drawText(page, "Totaal", col.tot, y, SMALL)
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

    const sub = Number(r.totaal || 0)
    kostprijs += sub

    drawText(page, r.code, col.code, y, SMALL)
    drawText(page, r.omschrijving, col.oms, y, SMALL)
    drawText(page, r.aantal, col.aant, y, SMALL)
    drawText(page, r.eenheid, col.eenh, y, SMALL)
    drawText(page, r.normuren, col.norm, y, SMALL)
    drawText(page, euro(r.loonkosten), col.loon, y, SMALL)
    drawText(page, euro(r.materiaalkosten), col.mat, y, SMALL)
    drawText(page, euro(sub), col.tot, y, SMALL)

    y -= LINE
  }

  /*
  ===========================================================
  STELPOSTEN
  ===========================================================
  */
  if (stelposten.length) {
    page = pdf.addPage([A4_L.w, A4_L.h])
    y = A4_L.h - MARGIN

    drawText(page, "Stelposten", 30, y, 14)
    y -= 30

    stelposten.forEach(s => {
      drawText(page, `${s.omschrijving} – ${euro(s.bedrag)}`, 30, y)
      y -= LINE
    })
  }

  /*
  ===========================================================
  AANNAMES / OPSLAGEN / UURLONEN
  ===========================================================
  */
  page = pdf.addPage([A4_L.w, A4_L.h])
  y = A4_L.h - MARGIN

  drawText(page, "Aannames & Opslagen", 30, y, 14)
  y -= 30

  drawText(
    page,
    `AK ${correcties?.ak_pct * 100 || 0}% | ABK ${correcties?.abk_pct * 100 || 0}% | W ${correcties?.w_pct * 100 || 0}% | R ${correcties?.r_pct * 100 || 0}%`,
    30,
    y
  )
  y -= 30

  drawText(page, "Uurlonen:", 30, y, 12)
  y -= 20

  uurlonen.forEach(u => {
    drawText(page, `${u.discipline}: € ${u.uurloon}/uur`, 30, y)
    y -= LINE
  })

  /*
  ===========================================================
  OPSLAAN + PUBLIC URL
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

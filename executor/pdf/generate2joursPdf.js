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
===========================================================
- GEEN templates
- GEEN aannames
- GEEN shortcuts
- ALLE ketenstappen zichtbaar in PDF
===========================================================
*/

const A4_P = { w: 595, h: 842 }
const A4_L = { w: 842, h: 595 }

const MARGIN = 40
const LINE = 12
const SMALL = 8
const NORMAL = 10
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
  PROJECT
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
  CALCULATIE (STABU VIEW)
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
  BIJGEGEVENS
  ============================
  */
  const { data: stelposten = [] } =
    await supabase.from("calculatie_stelposten").select("*").eq("project_id", project_id)

  const { data: correcties } =
    await supabase.from("calculatie_correcties").select("*").eq("project_id", project_id).single()

  const { data: uurlonen = [] } =
    await supabase.from("calculatie_uurloon_overrides").select("*").eq("project_id", project_id)

  const { data: files = [] } =
    await supabase.from("project_files").select("file_name").eq("project_id", project_id)

  const { data: scanlog = [] } =
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

  const draw = (page, t, x, y, size = NORMAL) =>
    page.drawText(String(t ?? ""), { x, y, size, font, color: rgb(0, 0, 0) })

  /*
  ===========================================================
  VOORBLAD (STAAND)
  ===========================================================
  */
  let page = pdf.addPage([A4_P.w, A4_P.h])
  let y = A4_P.h - MARGIN

  draw(page, "2JOURS OFF ERTE / CALCULATIE", 140, y, TITLE)
  y -= 50

  draw(page, `Project: ${project.naam || ""}`, MARGIN, y)
  y -= LINE
  draw(page, `Opdrachtgever: ${project.naam_opdrachtgever || ""}`, MARGIN, y)
  y -= LINE
  draw(page, `Adres: ${project.adres || ""} ${project.plaatsnaam || ""}`, MARGIN, y)
  y -= LINE
  draw(page, `Telefoon: ${project.telefoon || ""}`, MARGIN, y)
  y -= LINE * 2

  draw(page, "Omschrijving:", MARGIN, y)
  y -= LINE
  draw(page, project.opmerking || "-", MARGIN, y)

  /*
  ===========================================================
  OPDRACHTBEVESTIGING
  ===========================================================
  */
  page = pdf.addPage([A4_P.w, A4_P.h])
  y = A4_P.h - MARGIN

  draw(page, "OPDRACHTBEVESTIGING", MARGIN, y, TITLE)
  y -= 40

  draw(
    page,
    "Deze offerte betreft de volledige calculatie conform STABU-systematiek, inclusief alle uitgangspunten, aannames, uploads en scanresultaten.",
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
    draw(page, "Aangeleverde documenten", MARGIN, y, 14)
    y -= 20

    files.forEach(f => {
      if (y < 60) {
        page = pdf.addPage([A4_P.w, A4_P.h])
        y = A4_P.h - MARGIN
      }
      draw(page, `- ${f.file_name}`, MARGIN, y, SMALL)
      y -= LINE
    })
  }

  /*
  ===========================================================
  SCAN LOG
  ===========================================================
  */
  if (scanlog.length) {
    page = pdf.addPage([A4_P.w, A4_P.h])
    y = A4_P.h - MARGIN

    draw(page, "Analyse & Scanlog", MARGIN, y, TITLE)
    y -= 30

    scanlog.forEach(l => {
      if (y < 60) {
        page = pdf.addPage([A4_P.w, A4_P.h])
        y = A4_P.h - MARGIN
      }
      draw(page, `${l.module} → ${l.status}`, MARGIN, y, SMALL)
      y -= LINE
    })
  }

  /*
  ===========================================================
  CALCULATIE – LIGGEND
  ===========================================================
  */
  page = pdf.addPage([A4_L.w, A4_L.h])
  y = A4_L.h - MARGIN

  const col = {
    code: 20,
    oms: 70,
    aant: 300,
    eenh: 330,
    mnorm: 360,
    uren: 395,
    loon: 430,
    prijs: 470,
    mat: 515,
    oaeh: 555,
    oa: 595,
    stelp: 635,
    stel: 675,
    tot: 715
  }

  function header() {
    draw(page, "Code", col.code, y, SMALL)
    draw(page, "Omschrijving", col.oms, y, SMALL)
    draw(page, "Aantal", col.aant, y, SMALL)
    draw(page, "Eenh.", col.eenh, y, SMALL)
    draw(page, "M.norm", col.mnorm, y, SMALL)
    draw(page, "Uren", col.uren, y, SMALL)
    draw(page, "Loon", col.loon, y, SMALL)
    draw(page, "Prijs/eh", col.prijs, y, SMALL)
    draw(page, "Materiaal", col.mat, y, SMALL)
    draw(page, "O.A./eh", col.oaeh, y, SMALL)
    draw(page, "O.A.", col.oa, y, SMALL)
    draw(page, "Stelp/eh", col.stelp, y, SMALL)
    draw(page, "Stelpost", col.stel, y, SMALL)
    draw(page, "Totaal", col.tot, y, SMALL)
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
    draw(page, r.normuren, col.mnorm, y, SMALL)
    draw(page, r.uren, col.uren, y, SMALL)
    draw(page, euro(r.loonkosten), col.loon, y, SMALL)
    draw(page, euro(r.prijs_eenheid), col.prijs, y, SMALL)
    draw(page, euro(r.materiaalkosten), col.mat, y, SMALL)
    draw(page, euro(r.oa_eenheid), col.oaeh, y, SMALL)
    draw(page, euro(r.overig_algemeen), col.oa, y, SMALL)
    draw(page, euro(r.stelpost_eenheid), col.stelp, y, SMALL)
    draw(page, euro(r.stelposten), col.stel, y, SMALL)
    draw(page, euro(totaal), col.tot, y, SMALL)

    y -= LINE
  }

  /*
  ===========================================================
  STELPOSTEN / OPSLAGEN / UURLONEN
  ===========================================================
  */
  page = pdf.addPage([A4_L.w, A4_L.h])
  y = A4_L.h - MARGIN

  draw(page, "Aannames & Opslagen", 30, y, 14)
  y -= 30

  draw(
    page,
    `AK ${correcties?.ak_pct * 100 || 0}% | ABK ${correcties?.abk_pct * 100 || 0}% | W ${correcties?.w_pct * 100 || 0}% | R ${correcties?.r_pct * 100 || 0}%`,
    30,
    y
  )

  y -= 40
  draw(page, "Uurlonen", 30, y, 12)
  y -= 20

  uurlonen.forEach(u => {
    draw(page, `${u.discipline}: € ${u.uurloon}/uur`, 30, y)
    y -= LINE
  })

  /*
  ===========================================================
  OPSLAAN
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

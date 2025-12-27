import { PDFDocument, StandardFonts, rgb } from "pdf-lib"
import { createClient } from "@supabase/supabase-js"

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
)

/*
===========================================================
2JOURS PDF – DEFINITIEF EINDPRODUCT
- Voorblad met NAW + inhoud
- STABU calculatie exact volgens 2jours
- Geen shortcuts
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

function safeArray(v) {
  return Array.isArray(v) ? v : []
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
  CALCULATIE VIEW
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

  const draw = (page, t, x, y, size = NORMAL) =>
    page.drawText(String(t ?? ""), { x, y, size, font, color: rgb(0, 0, 0) })

  /*
  ===========================================================
  VOORBLAD (2JOURS)
  ===========================================================
  */
  let page = pdf.addPage([A4_P.w, A4_P.h])
  let y = A4_P.h - MARGIN

  draw(page, "BouwProffs Nederland BV", 350, y, 12)
  y -= LINE
  draw(page, "Edisonstraat 16a", 350, y, SMALL)
  y -= LINE
  draw(page, "8912 AW Leeuwarden", 350, y, SMALL)
  y -= LINE
  draw(page, "Tel: 058 203 0660", 350, y, SMALL)

  y = A4_P.h - MARGIN
  draw(page, project.opdrachtgever || "", MARGIN, y, 10)
  y -= LINE
  draw(page, project.adres || "", MARGIN, y, SMALL)
  y -= LINE
  draw(page, `${project.postcode || ""} ${project.plaatsnaam || ""}`, MARGIN, y, SMALL)

  y -= 40
  draw(page, "OFFERTE / CALCULATIE", MARGIN, y, TITLE)
  y -= 30

  /*
  ===========================================================
  INHOUD (PER HOOFDSTUK)
  ===========================================================
  */
  const hoofdstukken = {}
  for (const r of regels) {
    if (!hoofdstukken[r.hoofdstuk_code]) {
      hoofdstukken[r.hoofdstuk_code] = {
        titel: r.hoofdstuk_omschrijving,
        totaal: 0
      }
    }
    hoofdstukken[r.hoofdstuk_code].totaal += Number(r.totaal || 0)
  }

  for (const h of Object.values(hoofdstukken)) {
    if (y < 80) {
      page = pdf.addPage([A4_P.w, A4_P.h])
      y = A4_P.h - MARGIN
    }
    draw(page, h.titel || "", MARGIN, y, 10)
    draw(page, euro(h.totaal), 450, y, 10)
    y -= LINE
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
    draw(page, "code", col.code, y, SMALL)
    draw(page, "omschrijving", col.oms, y, SMALL)
    draw(page, "aantal", col.aant, y, SMALL)
    draw(page, "eenh.", col.eenh, y, SMALL)
    draw(page, "m.norm", col.mnorm, y, SMALL)
    draw(page, "uren", col.uren, y, SMALL)
    draw(page, "loonkosten", col.loon, y, SMALL)
    draw(page, "prijs/eenh.", col.prijs, y, SMALL)
    draw(page, "materiaal/-eel", col.mat, y, SMALL)
    draw(page, "o.a./eenh.", col.oaeh, y, SMALL)
    draw(page, "o.a.", col.oa, y, SMALL)
    draw(page, "stelp/eenh.", col.stelp, y, SMALL)
    draw(page, "stelposten", col.stel, y, SMALL)
    draw(page, "totaal", col.tot, y, SMALL)
    y -= LINE
  }

  header()

  let lastHoofdstuk = null

  for (const r of regels) {
    if (y < 40) {
      page = pdf.addPage([A4_L.w, A4_L.h])
      y = A4_L.h - MARGIN
      header()
    }

    if (r.hoofdstuk_code !== lastHoofdstuk) {
      y -= LINE
      draw(page, `${r.hoofdstuk_code} ${r.hoofdstuk_omschrijving}`, col.code, y, 10)
      y -= LINE
      lastHoofdstuk = r.hoofdstuk_code
    }

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
    draw(page, euro(r.totaal), col.tot, y, SMALL)

    y -= LINE
  }

  /*
  ===========================================================
  OPSLAAN (GEFIXT PAD)
  ===========================================================
  */
  const bytes = await pdf.save()

  // ⬇⬇⬇ DIT IS DE ENIGE FUNCTIONELE WIJZIGING ⬇⬇⬇
  const path = `projects/${project_id}/calculatie_2jours.pdf`

  await supabase.storage
    .from("sterkcalc")
    .upload(path, bytes, {
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
    pdf_url: publicUrl
  }
}

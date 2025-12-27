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
- REKENWOLK = PLAT
- STABU-STRUCTUUR = ALLEEN RENDER-LAAG
- EXACTE KOLUMNEN VOLGENS 2JOURS
===========================================================
*/

const A4_P = { w: 595, h: 842 }
const A4_L = { w: 842, h: 595 }

const MARGIN = 40
const LINE = 12
const SMALL = 8
const NORMAL = 10
const TITLE = 18
const SUBTITLE = 12

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
  const { data: project, error: projErr } = await supabase
    .from("projects")
    .select("*")
    .eq("id", project_id)
    .single()

  if (projErr || !project) throw new Error("PROJECT_NOT_FOUND")

  /*
  ============================
  PLATTE REKENWOLK (VIEW)
  ============================
  */
  const { data: regelsRaw } = await supabase
    .from("v_calculatie_2jours")
    .select("*")
    .eq("project_id", project_id)
    .order("hoofdstuk_code", { ascending: true })
    .order("subhoofdstuk_code", { ascending: true })
    .order("code", { ascending: true })

  const regels = safeArray(regelsRaw)

  /*
  ============================
  PDF INIT
  ============================
  */
  const pdf = await PDFDocument.create()
  const font = await pdf.embedFont(StandardFonts.Helvetica)

  const draw = (page, t, x, y, size = NORMAL) =>
    page.drawText(String(t ?? ""), {
      x,
      y,
      size,
      font,
      color: rgb(0, 0, 0)
    })

  /*
  ===========================================================
  VOORBLAD
  ===========================================================
  */
  let page = pdf.addPage([A4_P.w, A4_P.h])
  let y = A4_P.h - MARGIN

  draw(page, "2JOURS OFFERTE / CALCULATIE", 140, y, TITLE)
  y -= 40

  draw(page, `Project: ${project.naam || ""}`, MARGIN, y)
  y -= LINE
  draw(page, `Opdrachtgever: ${project.naam_opdrachtgever || ""}`, MARGIN, y)
  y -= LINE
  draw(page, `Adres: ${project.adres || ""} ${project.plaatsnaam || ""}`, MARGIN, y)

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
    draw(page, "materiaal/eenh.", col.mat, y, SMALL)
    draw(page, "o.a./eenh.", col.oaeh, y, SMALL)
    draw(page, "o.a.", col.oa, y, SMALL)
    draw(page, "stelp./eenh.", col.stelp, y, SMALL)
    draw(page, "stelposten", col.stel, y, SMALL)
    draw(page, "totaal", col.tot, y, SMALL)
    y -= LINE
  }

  let lastHoofdstuk = null
  let lastSub = null
  let kostprijs = 0

  header()

  for (const r of regels) {
    if (y < 40) {
      page = pdf.addPage([A4_L.w, A4_L.h])
      y = A4_L.h - MARGIN
      header()
    }

    // HOOFDSTUK KOP (RENDER-LAAG)
    if (r.hoofdstuk_code && r.hoofdstuk_code !== lastHoofdstuk) {
      y -= LINE
      draw(
        page,
        `${r.hoofdstuk_code} ${r.hoofdstuk_titel || ""}`,
        col.code,
        y,
        SUBTITLE
      )
      y -= LINE
      lastHoofdstuk = r.hoofdstuk_code
      lastSub = null
    }

    // SUBHOOFDSTUK KOP (RENDER-LAAG)
    if (r.subhoofdstuk_code && r.subhoofdstuk_code !== lastSub) {
      draw(
        page,
        `${r.subhoofdstuk_code} ${r.subhoofdstuk_titel || ""}`,
        col.code + 10,
        y,
        NORMAL
      )
      y -= LINE
      lastSub = r.subhoofdstuk_code
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
    draw(page, euro(r.materiaalprijs), col.mat, y, SMALL)
    draw(page, euro(r.oa_eenheid), col.oaeh, y, SMALL)
    draw(page, euro(r.overig_algemeen), col.oa, y, SMALL)
    draw(page, euro(r.stelpost_eenheid), col.stelp, y, SMALL)
    draw(page, euro(r.stelposten), col.stel, y, SMALL)
    draw(page, euro(totaal), col.tot, y, SMALL)

    y -= LINE
  }

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

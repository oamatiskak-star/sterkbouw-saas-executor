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
- Rendert uitsluitend data uit v_calculatie_2jours
- Crasht nooit op null / lege datasets
- Executor-veilig
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

function safeArray(v) {
  return Array.isArray(v) ? v : []
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
  const { data: project, error: projectErr } = await supabase
    .from("projects")
    .select("*")
    .eq("id", project_id)
    .single()

  if (projectErr || !project) {
    throw new Error("PROJECT_NOT_FOUND")
  }

  /*
  ============================
  CALCULATIE VIEW (ENIGE BRON)
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
  BIJGEGEVENS
  ============================
  */
  const { data: filesRaw } =
    await supabase.from("project_files").select("file_name").eq("project_id", project_id)

  const files = safeArray(filesRaw)

  const { data: scanlogRaw } =
    await supabase
      .from("project_initialization_log")
      .select("*")
      .eq("project_id", project_id)
      .order("created_at", { ascending: true })

  const scanlog = safeArray(scanlogRaw)

  /*
  ============================
  PDF INIT
  ============================
  */
  const pdf = await PDFDocument.create()
  const font = await pdf.embedFont(StandardFonts.Helvetica)

  const draw = (page, t, x, y, size = NORMAL) => {
    page.drawText(String(t ?? ""), {
      x,
      y,
      size,
      font,
      color: rgb(0, 0, 0)
    })
  }

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
  y -= LINE * 2

  /*
  ===========================================================
  UPLOADS
  ===========================================================
  */
  if (files.length > 0) {
    y -= 20
    draw(page, "Aangeleverde documenten:", MARGIN, y, 12)
    y -= LINE

    for (const f of files) {
      draw(page, `- ${f.file_name}`, MARGIN, y, SMALL)
      y -= LINE
    }
  }

  /*
  ===========================================================
  SCANLOG
  ===========================================================
  */
  if (scanlog.length > 0) {
    page = pdf.addPage([A4_P.w, A4_P.h])
    y = A4_P.h - MARGIN

    draw(page, "Analyse & Scanlog", MARGIN, y, TITLE)
    y -= 30

    for (const l of scanlog) {
      draw(page, `${l.module || ""} → ${l.status || ""}`, MARGIN, y, SMALL)
      y -= LINE
    }
  }

  /*
  ===========================================================
  CALCULATIE (LIGGEND)
  ===========================================================
  */
  page = pdf.addPage([A4_L.w, A4_L.h])
  y = A4_L.h - MARGIN

  const col = {
    code: 20,
    oms: 70,
    aant: 300,
    eenh: 330,
    norm: 360,
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

  const header = () => {
    draw(page, "Code", col.code, y, SMALL)
    draw(page, "Omschrijving", col.oms, y, SMALL)
    draw(page, "Aantal", col.aant, y, SMALL)
    draw(page, "Eenh.", col.eenh, y, SMALL)
    draw(page, "Norm", col.norm, y, SMALL)
    draw(page, "Uren", col.uren, y, SMALL)
    draw(page, "Loon", col.loon, y, SMALL)
    draw(page, "Prijs/eh", col.prijs, y, SMALL)
    draw(page, "Materiaal", col.mat, y, SMALL)
    draw(page, "O.A.", col.oa, y, SMALL)
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
    draw(page, r.normuren, col.norm, y, SMALL)
    draw(page, r.uren, col.uren, y, SMALL)
    draw(page, euro(r.loonkosten), col.loon, y, SMALL)
    draw(page, euro(r.prijs_eenheid), col.prijs, y, SMALL)
    draw(page, euro(r.materiaalkosten), col.mat, y, SMALL)
    draw(page, euro(r.overig_algemeen), col.oa, y, SMALL)
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

  const pdfUrl =
    `${process.env.SUPABASE_URL}/storage/v1/object/public/sterkcalc/${path}`

  await supabase
    .from("projects")
    .update({ pdf_url: pdfUrl })
    .eq("id", project_id)

  return {
    status: "DONE",
    project_id,
    regels: regels.length,
    pdf_url: pdfUrl,
    kostprijs
  }
}

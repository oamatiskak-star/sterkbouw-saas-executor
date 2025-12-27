import { PDFDocument, StandardFonts, rgb } from "pdf-lib"
import { createClient } from "@supabase/supabase-js"

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
)

const A4_P = { w: 595, h: 842 }   // staand
const A4_L = { w: 842, h: 595 }   // liggend

const MARGIN = 40
const LINE = 12

function euro(n) {
  return `€ ${Number(n || 0).toFixed(2)}`
}

export async function generate2joursPdf(project_id) {
  if (!project_id) throw new Error("NO_PROJECT_ID")

  /*
  ============================
  DATA
  ============================
  */
  const { data: project } = await supabase
    .from("projects")
    .select("*")
    .eq("id", project_id)
    .single()

  if (!project) throw new Error("PROJECT_NOT_FOUND")

  const { data: regels = [] } = await supabase
    .from("v_calculatie_2jours")
    .select("*")
    .eq("project_id", project_id)
    .order("hoofdstuk_code")
    .order("subhoofdstuk_code")
    .order("code")

  const { data: stelposten = [] } =
    await supabase.from("calculatie_stelposten").select("*").eq("project_id", project_id)

  const { data: correcties } =
    await supabase.from("calculatie_correcties").select("*").eq("project_id", project_id).single()

  const { data: uurlonen = [] } =
    await supabase.from("calculatie_uurloon_overrides").select("*").eq("project_id", project_id)

  /*
  ============================
  PDF INIT
  ============================
  */
  const pdf = await PDFDocument.create()
  const font = await pdf.embedFont(StandardFonts.Helvetica)

  /*
  ============================
  VOORBLAD (STAAND – DYNAMISCH)
  ============================
  */
  let page = pdf.addPage([A4_P.w, A4_P.h])
  let y = A4_P.h - MARGIN

  const drawP = (t, x, y, s = 11) =>
    page.drawText(String(t), { x, y, size: s, font, color: rgb(0, 0, 0) })

  drawP("2jours Offerte / Calculatie", 180, y, 20)
  y -= 50

  drawP(`Project: ${project.naam || ""}`, MARGIN, y)
  y -= LINE
  drawP(`Opdrachtgever: ${project.naam_opdrachtgever || ""}`, MARGIN, y)
  y -= LINE
  drawP(`Adres: ${project.adres || ""} ${project.plaatsnaam || ""}`, MARGIN, y)
  y -= LINE
  drawP(`Telefoon: ${project.telefoon || ""}`, MARGIN, y)
  y -= LINE * 2

  drawP("Omschrijving:", MARGIN, y, 12)
  y -= LINE
  drawP(project.opmerking || "-", MARGIN, y)

  /*
  ============================
  OPDRACHTBEVESTIGING (STAAND)
  ============================
  */
  page = pdf.addPage([A4_P.w, A4_P.h])
  y = A4_P.h - MARGIN

  drawP("Opdrachtbevestiging", MARGIN, y, 18)
  y -= 40

  drawP(
    "Deze offerte betreft de volledige calculatie conform STABU-systematiek en bijbehorende uitgangspunten.",
    MARGIN,
    y,
    11
  )

  /*
  ============================
  CALCULATIE (LIGGEND – DYNAMISCH)
  ============================
  */
  page = pdf.addPage([A4_L.w, A4_L.h])
  y = A4_L.h - MARGIN

  const drawL = (t, x, y, s = 9) =>
    page.drawText(String(t), { x, y, size: s, font })

  const col = {
    code: 30,
    oms: 90,
    aant: 340,
    eenh: 380,
    norm: 430,
    loon: 470,
    mat: 520,
    tot: 600
  }

  function header() {
    drawL("Code", col.code, y)
    drawL("Omschrijving", col.oms, y)
    drawL("Aantal", col.aant, y)
    drawL("Eenh", col.eenh, y)
    drawL("Norm", col.norm, y)
    drawL("Loon", col.loon, y)
    drawL("Materiaal", col.mat, y)
    drawL("Totaal", col.tot, y)
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

    drawL(r.code, col.code, y)
    drawL(r.omschrijving, col.oms, y)
    drawL(r.aantal, col.aant, y)
    drawL(r.eenheid, col.eenh, y)
    drawL(r.normuren, col.norm, y)
    drawL(euro(r.loonkosten), col.loon, y)
    drawL(euro(r.materiaalkosten), col.mat, y)
    drawL(euro(sub), col.tot, y)

    y -= LINE
  }

  /*
  ============================
  STELPOSTEN
  ============================
  */
  if (stelposten.length) {
    page = pdf.addPage([A4_L.w, A4_L.h])
    y = A4_L.h - MARGIN

    drawL("Stelposten", 30, y, 14)
    y -= 30

    stelposten.forEach(s => {
      drawL(`${s.omschrijving} – ${euro(s.bedrag)}`, 30, y)
      y -= LINE
    })
  }

  /*
  ============================
  CORRECTIES + UURLONEN
  ============================
  */
  page = pdf.addPage([A4_L.w, A4_L.h])
  y = A4_L.h - MARGIN

  drawL("Aannames & Opslagen", 30, y, 14)
  y -= 30

  drawL(
    `AK ${correcties?.ak_pct * 100 || 0}% | ABK ${correcties?.abk_pct * 100 || 0}% | W ${correcties?.w_pct * 100 || 0}% | R ${correcties?.r_pct * 100 || 0}%`,
    30,
    y
  )
  y -= 30

  drawL("Uurlonen:", 30, y, 12)
  y -= 20

  uurlonen.forEach(u => {
    drawL(`${u.discipline}: € ${u.uurloon}/uur`, 30, y)
    y -= LINE
  })

  /*
  ============================
  OPSLAAN + LINK
  ============================
  */
  const bytes = await pdf.save()
  const path = `${project_id}/calculatie_2jours.pdf`

  await supabase.storage.from("sterkcalc").upload(path, bytes, {
    upsert: true,
    contentType: "application/pdf"
  })

  const { data: url } = await supabase.storage
    .from("sterkcalc")
    .createSignedUrl(path, 60 * 60 * 24)

  if (!url?.signedUrl) throw new Error("SIGNED_URL_FAILED")

  await supabase
    .from("projects")
    .update({ pdf_url: url.signedUrl })
    .eq("id", project_id)

  return {
    status: "DONE",
    project_id,
    pdf_url: url.signedUrl
  }
}

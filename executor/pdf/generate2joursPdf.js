import { PDFDocument, StandardFonts, rgb } from "pdf-lib"
import { createClient } from "@supabase/supabase-js"

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
)

const A4_PORTRAIT = { width: 595, height: 842 }
const A4_LANDSCAPE = { width: 842, height: 595 }

export async function generate2joursPdf(project_id) {
  // =========================
  // DATA OPHALEN
  // =========================

  const { data: project } = await supabase
    .from("projects")
    .select("*")
    .eq("id", project_id)
    .single()

  const { data: regels } = await supabase
    .from("v_calculatie_2jours")
    .select("*")
    .eq("project_id", project_id)
    .order("hoofdstuk_code")
    .order("subhoofdstuk_code")
    .order("code")

  const { data: stelposten } = await supabase
    .from("calculatie_stelposten")
    .select("*")
    .eq("project_id", project_id)

  const { data: correcties } = await supabase
    .from("calculatie_correcties")
    .select("*")
    .eq("project_id", project_id)
    .single()

  const { data: uurlonen } = await supabase
    .from("calculatie_uurloon_overrides")
    .select("*")
    .eq("project_id", project_id)

  // =========================
  // PDF INIT
  // =========================

  const pdf = await PDFDocument.create()
  const font = await pdf.embedFont(StandardFonts.Helvetica)

  // =========================
  // PAGINA 1 – VOORBLAD (STAAND)
  // =========================

  const p1 = pdf.addPage([A4_PORTRAIT.width, A4_PORTRAIT.height])
  let y = 780

  p1.drawText("CALCULATIE / OFFERTE", {
    x: 50,
    y,
    size: 20,
    font
  })

  y -= 40
  p1.drawText(`Project: ${project.naam}`, { x: 50, y, size: 12, font })
  y -= 20
  p1.drawText(`Opdrachtgever: ${project.naam_opdrachtgever}`, {
    x: 50,
    y,
    size: 12,
    font
  })
  y -= 20
  p1.drawText(`Adres: ${project.adres}, ${project.plaatsnaam}`, {
    x: 50,
    y,
    size: 12,
    font
  })

  // =========================
  // PAGINA 2 – OPDRACHTBEVESTIGING (STAAND)
  // =========================

  const p2 = pdf.addPage([A4_PORTRAIT.width, A4_PORTRAIT.height])
  y = 780

  p2.drawText("OPDRACHTBEVESTIGING", {
    x: 50,
    y,
    size: 18,
    font
  })

  y -= 40
  p2.drawText(
    "Deze offerte betreft de uitvoering van de werkzaamheden conform bijgevoegde calculatie.",
    { x: 50, y, size: 11, font, maxWidth: 480 }
  )

  // =========================
  // PAGINA 3+ – CALCULATIE (LIGGEND)
  // =========================

  let page = pdf.addPage([A4_LANDSCAPE.width, A4_LANDSCAPE.height])
  let xStart = 30
  y = 560

  function drawHeader() {
    const headers = [
      "Code",
      "Omschrijving",
      "Aantal",
      "Eenh.",
      "Norm",
      "Uren",
      "Loon",
      "Mat/eenh",
      "Mat totaal",
      "Stelp",
      "Totaal"
    ]

    let x = xStart
    headers.forEach(h => {
      page.drawText(h, { x, y, size: 9, font })
      x += 75
    })
    y -= 15
  }

  drawHeader()

  for (const r of regels) {
    if (y < 40) {
      page = pdf.addPage([A4_LANDSCAPE.width, A4_LANDSCAPE.height])
      y = 560
      drawHeader()
    }

    let x = xStart
    const cols = [
      r.code,
      r.omschrijving,
      r.aantal,
      r.eenheid,
      r.normuren,
      r.uren,
      r.loonkosten,
      r.materiaalprijs,
      r.materiaalkosten,
      r.stelposten,
      r.totaal
    ]

    cols.forEach(c => {
      page.drawText(String(c ?? ""), { x, y, size: 8, font })
      x += 75
    })

    y -= 12
  }

  // =========================
  // STELPOSTEN (LIGGEND)
  // =========================

  if (stelposten?.length) {
    page = pdf.addPage([A4_LANDSCAPE.width, A4_LANDSCAPE.height])
    y = 560

    page.drawText("STELPOSTEN", { x: 30, y, size: 14, font })
    y -= 30

    for (const s of stelposten) {
      page.drawText(
        `${s.omschrijving} – € ${Number(s.bedrag).toFixed(2)}`,
        { x: 30, y, size: 10, font }
      )
      y -= 14
    }
  }

  // =========================
  // AANNAMES & CORRECTIES (LIGGEND)
  // =========================

  page = pdf.addPage([A4_LANDSCAPE.width, A4_LANDSCAPE.height])
  y = 560

  page.drawText("AANNAMES EN CORRECTIES", { x: 30, y, size: 14, font })
  y -= 30

  page.drawText(`Projecttype: ${correcties.projecttype}`, {
    x: 30,
    y,
    size: 10,
    font
  })
  y -= 20

  page.drawText(
    `AK ${correcties.ak_pct * 100}%  | ABK ${
      correcties.abk_pct * 100
    }%  | W ${correcties.w_pct * 100}%  | R ${
      correcties.r_pct * 100
    }%`,
    { x: 30, y, size: 10, font }
  )

  y -= 30
  page.drawText("Uurlonen per discipline:", { x: 30, y, size: 11, font })
  y -= 15

  for (const u of uurlonen) {
    page.drawText(`${u.discipline}: € ${u.uurloon}/uur`, {
      x: 30,
      y,
      size: 10,
      font
    })
    y -= 12
  }

  // =========================
  // OPSLAAN
  // =========================

  const pdfBytes = await pdf.save()

  await supabase.storage
    .from("sterkcalc")
    .upload(`${project_id}/calculatie_2jours.pdf`, pdfBytes, {
      contentType: "application/pdf",
      upsert: true
    })

  return true
}

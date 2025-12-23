import { createClient } from "@supabase/supabase-js"
import pkg from "pdf-lib"

const { PDFDocument, rgb, StandardFonts } = pkg

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
)

const ak_pct = 0.08
const abk_pct = 0.06
const wr_pct = 0.08

function euro(n) {
  return `€ ${Number(n || 0).toFixed(2)}`
}

async function getOrCreateCalculatie(project_id) {
  const { data: existing } = await supabase
    .from("calculaties")
    .select("*")
    .eq("project_id", project_id)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle()

  if (existing) return existing

  const { data, error } = await supabase
    .from("calculaties")
    .insert({
      project_id,
      workflow_status: "running",
      created_at: new Date().toISOString()
    })
    .select("*")
    .single()

  if (error || !data) throw new Error("calculatie_create_failed")
  return data
}

async function fetchStabuRegels(project_id) {
  const { data, error } = await supabase
    .from("stabu_result_regels")
    .select("omschrijving, hoeveelheid, eenheidsprijs, btw_tarief")
    .eq("project_id", project_id)

  if (error || !data || data.length === 0) {
    throw new Error("stabu_empty")
  }

  return data
}

async function generate2joursPdf(calculatie, regels, totalen) {
  const pdf = await PDFDocument.create()
  const font = await pdf.embedFont(StandardFonts.Helvetica)

  let page = pdf.addPage([595, 842])
  let y = 760

  const header = () => {
    page.drawText("2JOURS CALCULATIE", {
      x: 40,
      y: 810,
      size: 14,
      font,
      color: rgb(0, 0, 0)
    })

    page.drawText(`Project ${calculatie.project_id}`, {
      x: 40,
      y: 792,
      size: 9,
      font
    })

    page.drawText(`Calculatie ${calculatie.id}`, {
      x: 360,
      y: 792,
      size: 9,
      font
    })

    page.drawLine({
      start: { x: 40, y: 775 },
      end: { x: 555, y: 775 },
      thickness: 1,
      color: rgb(0.8, 0.8, 0.8)
    })

    y = 750
  }

  const footer = () => {
    page.drawLine({
      start: { x: 40, y: 60 },
      end: { x: 555, y: 60 },
      thickness: 1,
      color: rgb(0.8, 0.8, 0.8)
    })

    page.drawText("SterkCalc – 2jours calculatie", {
      x: 40,
      y: 45,
      size: 8,
      font,
      color: rgb(0.5, 0.5, 0.5)
    })
  }

  const row = (a, b, c, d, e) => {
    if (y < 90) {
      footer()
      page = pdf.addPage([595, 842])
      header()
    }

    page.drawText(a, { x: 40, y, size: 9, font })
    page.drawText(b, { x: 300, y, size: 9, font })
    page.drawText(c, { x: 360, y, size: 9, font })
    page.drawText(d, { x: 430, y, size: 9, font })
    page.drawText(e, { x: 500, y, size: 9, font })

    y -= 14
  }

  header()

  row("Omschrijving", "Aantal", "Prijs", "Subtotaal", "BTW")
  y -= 6

  regels.forEach(r => {
    const sub = r.hoeveelheid * r.eenheidsprijs
    row(
      r.omschrijving,
      String(r.hoeveelheid),
      euro(r.eenheidsprijs),
      euro(sub),
      `${r.btw_tarief}%`
    )
  })

  y -= 20

  row("Kostprijs", "", "", euro(totalen.kostprijs), "")
  row("AK 8%", "", "", euro(totalen.ak), "")
  row("ABK 6%", "", "", euro(totalen.abk), "")
  row("W&R 8%", "", "", euro(totalen.wr), "")
  y -= 10
  row("Verkoopprijs excl. btw", "", "", euro(totalen.verkoop_ex), "")
  row("BTW 9%", "", "", euro(totalen.btw9), "")
  row("BTW 21%", "", "", euro(totalen.btw21), "")
  row("Verkoopprijs incl. btw", "", "", euro(totalen.verkoop_inc), "")

  footer()

  return pdf.save()
}

async function uploadPdf(project_id, pdfBytes) {
  const path = `${project_id}/calculatie_2jours.pdf`

  await supabase.storage
    .from("sterkcalc")
    .upload(path, pdfBytes, {
      contentType: "application/pdf",
      upsert: true
    })

  return path
}

export async function handleStartRekenwolk(task) {
  if (!task?.id) return

  const project_id =
    task.project_id || task.payload?.project_id

  const calculatie = await getOrCreateCalculatie(project_id)
  const regels = await fetchStabuRegels(project_id)

  let kostprijs = 0
  let btw9 = 0
  let btw21 = 0

  regels.forEach(r => {
    const sub = r.hoeveelheid * r.eenheidsprijs
    kostprijs += sub
    if (r.btw_tarief === 9) btw9 += sub * 0.09
    if (r.btw_tarief === 21) btw21 += sub * 0.21
  })

  const ak = kostprijs * ak_pct
  const abk = kostprijs * abk_pct
  const wr = kostprijs * wr_pct
  const verkoop_ex = kostprijs + ak + abk + wr
  const verkoop_inc = verkoop_ex + btw9 + btw21

  const pdfBytes = await generate2joursPdf(calculatie, regels, {
    kostprijs,
    ak,
    abk,
    wr,
    verkoop_ex,
    btw9,
    btw21,
    verkoop_inc
  })

  await uploadPdf(project_id, pdfBytes)

  await supabase
    .from("calculaties")
    .update({
      workflow_status: "done",
      kostprijs,
      verkoopprijs: verkoop_ex,
      marge: verkoop_ex - kostprijs,
      updated_at: new Date().toISOString()
    })
    .eq("id", calculatie.id)

  await supabase
    .from("executor_tasks")
    .update({
      status: "completed",
      finished_at: new Date().toISOString()
    })
    .eq("id", task.id)

  return { state: "done" }
}

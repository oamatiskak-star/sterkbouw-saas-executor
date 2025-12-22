import { createClient } from "@supabase/supabase-js"
import { PDFDocument, rgb, StandardFonts } from "pdf-lib"

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
)

/*
===========================================================
REKENWOLK – EINDPRODUCT ENGINE (2JOURS PDF)
===========================================================
INPUT: project_id
OUTPUT:
- calculaties bijgewerkt
- calculatie_regels gevuld
- PDF gegenereerd (2jours)
- workflow_status = done
===========================================================
*/

function assert(cond, msg) {
  if (!cond) throw new Error(msg)
}

function round2(n) {
  return Math.round(n * 100) / 100
}

async function getActiveCalculatie(project_id) {
  const { data, error } = await supabase
    .from("calculaties")
    .select("*")
    .eq("project_id", project_id)
    .order("created_at", { ascending: false })
    .limit(1)
    .single()

  assert(!error && data, "NO_CALCULATIE")
  return data
}

async function getStabu() {
  const { data, error } = await supabase
    .from("stabu_regels")
    .select("code, omschrijving, eenheid, prijs")

  assert(!error && data?.length, "NO_STABU")
  return data
}

async function getHoeveelheden(project_id) {
  const { data, error } = await supabase
    .from("project_hoeveelheden")
    .select("stabu_code, hoeveelheid")
    .eq("project_id", project_id)

  assert(!error, "NO_HOEVEELHEDEN")
  return data || []
}

function buildRegels(stabu, qty) {
  const qtyMap = {}
  for (const q of qty) qtyMap[q.stabu_code] = Number(q.hoeveelheid || 0)

  const regels = []

  for (const s of stabu) {
    const h = qtyMap[s.code]
    if (!h || h <= 0) continue
    const totaal = round2(h * Number(s.prijs))
    regels.push({
      stabu_code: s.code,
      omschrijving: s.omschrijving,
      eenheid: s.eenheid,
      hoeveelheid: h,
      prijs: Number(s.prijs),
      totaal
    })
  }

  assert(regels.length, "NO_REGELS")
  return regels
}

async function writeRegels(calculatie_id, regels) {
  await supabase
    .from("calculatie_regels")
    .delete()
    .eq("calculatie_id", calculatie_id)

  const rows = regels.map(r => ({
    calculatie_id,
    stabu_code: r.stabu_code,
    omschrijving: r.omschrijving,
    eenheid: r.eenheid,
    hoeveelheid: r.hoeveelheid,
    prijs: r.prijs,
    totaal: r.totaal
  }))

  const { error } = await supabase
    .from("calculatie_regels")
    .insert(rows)

  assert(!error, "WRITE_REGELS_FAILED")
}

function calcTotals(regels) {
  const kostprijs = round2(regels.reduce((s, r) => s + r.totaal, 0))
  const opslag = 0.15
  const verkoopprijs = round2(kostprijs * (1 + opslag))
  const marge = round2(verkoopprijs - kostprijs)
  return { kostprijs, verkoopprijs, marge }
}

async function updateCalculatie(calculatie_id, totals) {
  const { error } = await supabase
    .from("calculaties")
    .update({
      kostprijs: totals.kostprijs,
      verkoopprijs: totals.verkoopprijs,
      marge: totals.marge,
      workflow_status: "done"
    })
    .eq("id", calculatie_id)

  assert(!error, "UPDATE_CALCULATIE_FAILED")
}

/*
========================
2JOURS PDF GENERATOR
========================
*/

async function generate2JoursPdf(calculatie, regels, totals) {
  const pdf = await PDFDocument.create()
  const page = pdf.addPage([595, 842])
  const font = await pdf.embedFont(StandardFonts.Helvetica)

  let y = 800
  const line = (t, size = 10) => {
    page.drawText(t, { x: 40, y, size, font, color: rgb(0, 0, 0) })
    y -= size + 6
  }

  line("CALCULATIE – 2JOURS", 16)
  y -= 10

  line(`Project: ${calculatie.project_id}`)
  line(`Calculatie: ${calculatie.id}`)
  y -= 10

  line("REGELS:", 12)
  y -= 6

  for (const r of regels) {
    line(
      `${r.stabu_code} | ${r.omschrijving} | ${r.hoeveelheid} ${r.eenheid} x €${r.prijs} = €${r.totaal}`
    )
    if (y < 80) {
      y = 800
      pdf.addPage([595, 842])
    }
  }

  y -= 10
  line(`Kostprijs: € ${totals.kostprijs}`, 12)
  line(`Verkoopprijs: € ${totals.verkoopprijs}`, 12)
  line(`Marge: € ${totals.marge}`, 12)

  return await pdf.save()
}

async function uploadPdf(project_id, pdfBytes) {
  const path = `${project_id}/calculatie_2jours.pdf`
  const { error } = await supabase.storage
    .from("sterkcalc")
    .upload(path, pdfBytes, {
      contentType: "application/pdf",
      upsert: true
    })

  assert(!error, "PDF_UPLOAD_FAILED")
  return path
}

/*
========================
ENTRYPOINT
========================
*/

export async function handleStartRekenwolk(task) {
  assert(task, "NO_TASK")

  const project_id = task.project_id || task.payload?.project_id
  assert(project_id, "NO_PROJECT_ID")

  const calculatie = await getActiveCalculatie(project_id)
  const stabu = await getStabu()
  const hoeveelheden = await getHoeveelheden(project_id)

  const regels = buildRegels(stabu, hoeveelheden)
  await writeRegels(calculatie.id, regels)

  const totals = calcTotals(regels)
  await updateCalculatie(calculatie.id, totals)

  const pdfBytes = await generate2JoursPdf(calculatie, regels, totals)
  const pdfPath = await uploadPdf(project_id, pdfBytes)

  await supabase
    .from("calculaties")
    .update({ pdf_path: pdfPath })
    .eq("id", calculatie.id)

  return {
    state: "DONE",
    project_id,
    calculatie_id: calculatie.id,
    pdf: pdfPath
  }
}

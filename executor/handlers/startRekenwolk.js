import { createClient } from "@supabase/supabase-js"
import { PDFDocument, rgb, StandardFonts } from "pdf-lib"

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
)

/*
===========================================================
REKENWOLK – STERKCALC DEFINITIEVE VERSIE
===========================================================
- Eén rekenwolk per project
- Idempotent uitgevoerd
- Echte bedragen
- AK 8%, ABK 6%, W&R 8%
- BTW 9% / 21% per regel
===========================================================
*/

const AK = 0.08
const ABK = 0.06
const WR = 0.08

function assert(cond, msg) {
  if (!cond) throw new Error(msg)
}

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

  assert(!error && data, "CALCULATIE_CREATE_FAILED")
  return data
}

/*
========================
STABU RESULT REGELS
Verwacht:
- omschrijving
- hoeveelheid
- eenheidsprijs
- btw_tarief (9 of 21)
========================
*/
async function fetchStabuResultRegels(project_id) {
  const { data, error } = await supabase
    .from("stabu_result_regels")
    .select("omschrijving, hoeveelheid, eenheidsprijs, btw_tarief")
    .eq("project_id", project_id)

  assert(!error, "STABU_FETCH_FAILED")
  assert(data && data.length > 0, "STABU_EMPTY")
  return data
}

/*
========================
2JOURS PDF
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
  line(`Project ID: ${calculatie.project_id}`)
  line(`Calculatie ID: ${calculatie.id}`)
  y -= 14

  line("POSTEN", 12)
  regels.forEach(r => {
    const sub = Number(r.hoeveelheid) * Number(r.eenheidsprijs)
    line(
      `${r.omschrijving} | ${r.hoeveelheid} x ${euro(
        r.eenheidsprijs
      )} = ${euro(sub)} | BTW ${r.btw_tarief}%`
    )
  })

  y -= 14
  line("TOTAAL", 12)
  line(`Kostprijs: ${euro(totals.kostprijs)}`)
  line(`AK (8%): ${euro(totals.ak)}`)
  line(`ABK (6%): ${euro(totals.abk)}`)
  line(`W&R (8%): ${euro(totals.wr)}`)
  y -= 8
  line(`Verkoopprijs excl. btw: ${euro(totals.verkoop_ex)}`)
  line(`BTW 9%: ${euro(totals.btw9)}`)
  line(`BTW 21%: ${euro(totals.btw21)}`)
  line(`Verkoopprijs incl. btw: ${euro(totals.verkoop_inc)}`)

  return pdf.save()
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
  if (!task || !task.id) return

  const project_id =
    task.project_id ||
    task.payload?.project_id ||
    null

  if (!project_id) {
    await supabase
      .from("executor_tasks")
      .update({
        status: "failed",
        error: "NO_PROJECT_ID",
        finished_at: new Date().toISOString()
      })
      .eq("id", task.id)
    return
  }

  /*
  IDEMPOTENT GUARD
  */
  const { data: existingDone } = await supabase
    .from("calculaties")
    .select("id")
    .eq("project_id", project_id)
    .eq("workflow_status", "done")
    .limit(1)
    .maybeSingle()

  if (existingDone) {
    await supabase
      .from("executor_tasks")
      .update({
        status: "skipped",
        finished_at: new Date().toISOString()
      })
      .eq("id", task.id)

    return {
      state: "SKIPPED_ALREADY_DONE",
      project_id,
      calculatie_id: existingDone.id
    }
  }

  try {
    const calculatie = await getOrCreateCalculatie(project_id)

    /*
    STABU → BEREKENEN
    */
    const regels = await fetchStabuResultRegels(project_id)

    let kostprijs = 0
    let btw9 = 0
    let btw21 = 0

    regels.forEach(r => {
      const sub = Number(r.hoeveelheid) * Number(r.eenheidsprijs)
      kostprijs += sub
      if (Number(r.btw_tarief) === 9) btw9 += sub * 0.09
      if (Number(r.btw_tarief) === 21) btw21 += sub * 0.21
    })

    const ak = kostprijs * AK
    const abk = kostprijs * ABK
    const wr = kostprijs * WR

    const verkoop_ex = kostprijs + ak + abk + wr
    const btw = btw9 + btw21
    const verkoop_inc = verkoop_ex + btw

    /*
    PDF
    */
    const pdfBytes = await generate2JoursPdf(calculatie, regels, {
      kostprijs,
      ak,
      abk,
      wr,
      verkoop_ex,
      btw9,
      btw21,
      verkoop_inc
    })

    const pdfPath = await uploadPdf(project_id, pdfBytes)

    /*
    OPSLAAN
    */
    await supabase
      .from("calculaties")
      .update({
        workflow_status: "done",
        kostprijs,
        verkoopprijs: verkoop_ex,
        marge: verkoop_ex - kostprijs,
        pdf_path: pdfPath,
        updated_at: new Date().toISOString()
      })
      .eq("id", calculatie.id)

    await supabase
      .from("projects")
      .update({
        analysis_status: "completed",
        updated_at: new Date().toISOString()
      })
      .eq("id", project_id)

    await supabase
      .from("executor_tasks")
      .update({
        status: "completed",
        finished_at: new Date().toISOString()
      })
      .eq("id", task.id)

    return {
      state: "DONE",
      project_id,
      calculatie_id: calculatie.id,
      pdf: pdfPath
    }
  } catch (err) {
    await supabase
      .from("executor_tasks")
      .update({
        status: "failed",
        error: err.message,
        finished_at: new Date().toISOString()
      })
      .eq("id", task.id)

    throw err
  }
}

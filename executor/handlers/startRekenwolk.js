import { createClient } from "@supabase/supabase-js"
import pkg from "pdf-lib"

const { PDFDocument, rgb, StandardFonts } = pkg

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
)

/*
===========================================================
REKENWOLK – DEFINITIEF (STABU PLAT MODEL)
===========================================================
- stabu_result_regels = platte tabel
- regels is altijd array
- geen json/result kolommen
- harde guards
- pdf altijd gegenereerd
===========================================================
*/

const AK_PCT = 0.08
const ABK_PCT = 0.06
const WR_PCT = 0.08

function euro(n) {
  return `€ ${Number(n || 0).toFixed(2)}`
}

/*
===========================================================
CALCULATIE
===========================================================
*/
async function getOrCreateCalculatie(project_id) {
  const { data: existing, error: findErr } = await supabase
    .from("calculaties")
    .select("*")
    .eq("project_id", project_id)
    .order("created_at", { ascending: false })
    .limit(1)

  if (findErr) throw findErr
  if (existing && existing.length > 0) return existing[0]

  const { data, error } = await supabase
    .from("calculaties")
    .insert({
      project_id,
      workflow_status: "running",
      created_at: new Date().toISOString()
    })
    .select("*")
    .single()

  if (error) throw error
  return data
}

/*
===========================================================
STABU REGELS – ENIGE JUISTE FETCH
===========================================================
*/
async function fetchStabuRegels(project_id) {
  const { data, error } = await supabase
    .from("stabu_result_regels")
    .select("omschrijving, hoeveelheid, eenheidsprijs, btw_tarief")
    .eq("project_id", project_id)

  if (error) {
    throw new Error("stabu_fetch_failed: " + error.message)
  }

  if (!Array.isArray(data)) {
    throw new Error("stabu_result_not_array")
  }

  return data
}

/*
===========================================================
PDF GENERATIE
===========================================================
*/
async function generatePdf(calculatie, regels, totalen) {
  const pdf = await PDFDocument.create()
  const font = await pdf.embedFont(StandardFonts.Helvetica)

  /*
  ========================
  VOORBLAD
  ========================
  */
  const cover = pdf.addPage([595, 842])

  try {
    const res = await fetch(
      "https://cdn.jsdelivr.net/gh/oamatiskak-star/assets@main/sterkbouw-logo.png"
    )
    if (res.ok) {
      const buf = await res.arrayBuffer()
      const logo = await pdf.embedPng(buf)
      cover.drawImage(logo, { x: 40, y: 760, width: 120, height: 40 })
    }
  } catch (_) {}

  const drawCoverText = (t, x, y, size = 10) => {
    cover.drawText(String(t), { x, y, size, font, color: rgb(0, 0, 0) })
  }

  drawCoverText("sterkbouw b.v.", 40, 710, 12)
  drawCoverText("offerte / calculatie", 350, 710, 14)
  drawCoverText(`project id: ${calculatie.project_id}`, 350, 690)
  drawCoverText(`calculatie id: ${calculatie.id}`, 350, 674)
  drawCoverText(
    `datum: ${new Date().toLocaleDateString("nl-NL")}`,
    350,
    658
  )

  /*
  ========================
  CALCULATIE PAGINA
  ========================
  */
  const page = pdf.addPage([595, 842])
  let y = 800

  const line = (t, size = 10) => {
    page.drawText(String(t), { x: 40, y, size, font })
    y -= size + 6
  }

  line("calculatie – 2jours", 16)
  y -= 10

  regels.forEach(r => {
    const sub = Number(r.hoeveelheid) * Number(r.eenheidsprijs)
    line(
      `${r.omschrijving} | ${r.hoeveelheid} x ${euro(
        r.eenheidsprijs
      )} = ${euro(sub)} | btw ${r.btw_tarief}%`
    )
  })

  y -= 16
  line(`kostprijs: ${euro(totalen.kostprijs)}`)
  line(`ak (8%): ${euro(totalen.ak)}`)
  line(`abk (6%): ${euro(totalen.abk)}`)
  line(`w&r (8%): ${euro(totalen.wr)}`)
  y -= 8
  line(`verkoopprijs excl. btw: ${euro(totalen.verkoop_ex)}`)
  line(`btw 9%: ${euro(totalen.btw9)}`)
  line(`btw 21%: ${euro(totalen.btw21)}`)
  line(`verkoopprijs incl. btw: ${euro(totalen.verkoop_inc)}`)

  return pdf.save()
}

/*
===========================================================
PDF UPLOAD
===========================================================
*/
async function uploadPdf(project_id, pdfBytes) {
  const path = `${project_id}/calculatie_2jours.pdf`

  const { error } = await supabase.storage
    .from("sterkcalc")
    .upload(path, pdfBytes, {
      contentType: "application/pdf",
      upsert: true
    })

  if (error) throw error
}

/*
===========================================================
ENTRYPOINT
===========================================================
*/
export async function handleStartRekenwolk(task) {
  if (!task?.id) return

  const taskId = task.id
  const project_id = task.project_id || task.payload?.project_id

  if (!project_id) {
    await supabase
      .from("executor_tasks")
      .update({
        status: "failed",
        error: "no_project_id",
        finished_at: new Date().toISOString()
      })
      .eq("id", taskId)
    return
  }

  try {
    const calculatie = await getOrCreateCalculatie(project_id)

    const regels = await fetchStabuRegels(project_id)

    if (!Array.isArray(regels) || regels.length === 0) {
      throw new Error("no_stabu_regels_for_project")
    }

    let kostprijs = 0
    let btw9 = 0
    let btw21 = 0

    regels.forEach(r => {
      const sub = Number(r.hoeveelheid) * Number(r.eenheidsprijs)
      kostprijs += sub
      if (Number(r.btw_tarief) === 9) btw9 += sub * 0.09
      if (Number(r.btw_tarief) === 21) btw21 += sub * 0.21
    })

    const ak = kostprijs * AK_PCT
    const abk = kostprijs * ABK_PCT
    const wr = kostprijs * WR_PCT

    const verkoop_ex = kostprijs + ak + abk + wr
    const verkoop_inc = verkoop_ex + btw9 + btw21

    const pdfBytes = await generatePdf(calculatie, regels, {
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
      .eq("id", taskId)
  } catch (err) {
    const msg = err?.message || "rekenwolk_error"

    await supabase
      .from("executor_tasks")
      .update({
        status: "failed",
        error: msg,
        finished_at: new Date().toISOString()
      })
      .eq("id", taskId)

    throw err
  }
}

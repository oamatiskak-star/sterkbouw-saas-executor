import { createClient } from "@supabase/supabase-js"
import pkg from "pdf-lib"

const { PDFDocument, rgb, StandardFonts } = pkg

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
)

/*
===========================================================
rekenwolk – sterkcalc definitieve versie
===========================================================
- één rekenwolk per project
- idempotent
- echte bedragen
- ak 8%, abk 6%, w&r 8%
- btw 9% / 21% per regel
- pdf met voorblad + calculatie (2jours)
===========================================================
*/

const ak_pct = 0.08
const abk_pct = 0.06
const wr_pct = 0.08

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

  assert(!error && data, "calculatie_create_failed")
  return data
}

async function fetchStabuRegels(project_id) {
  const { data, error } = await supabase
    .from("stabu_result_regels")
    .select("omschrijving, hoeveelheid, eenheidsprijs, btw_tarief")
    .eq("project_id", project_id)

  assert(!error, "stabu_fetch_failed")
  assert(data && data.length > 0, "stabu_empty")

  return data
}

/*
===========================================================
pdf opbouw
===========================================================
*/
async function generatePdf(calculatie, regels, totalen) {
  const pdf = await PDFDocument.create()
  const font = await pdf.embedFont(StandardFonts.Helvetica)

  /*
  ========================
  voorblad
  ========================
  */
  const cover = pdf.addPage([595, 842])

  const logoBytes = await fetch(
    "https://cdn.jsdelivr.net/gh/oamatiskak-star/assets@main/sterkbouw-logo.png"
  ).then(r => r.arrayBuffer())

  const logo = await pdf.embedPng(logoBytes)

  cover.drawImage(logo, {
    x: 40,
    y: 760,
    width: 120,
    height: 40
  })

  const text = (t, x, y, size = 10) => {
    cover.drawText(String(t), {
      x,
      y,
      size,
      font,
      color: rgb(0, 0, 0)
    })
  }

  text("sterkbouw b.v.", 40, 710, 12)
  text("edisonstraat 16a", 40, 694)
  text("8912 aw leeuwarden", 40, 678)
  text("www.sterkbouw.nl", 40, 662)
  text("info@sterkbouw.nl", 40, 646)
  text("+31 6 300 688 31", 40, 630)
  text("kvk 97554839", 40, 614)
  text("btw nl868107591", 40, 598)

  text("offerte / calculatie", 350, 710, 14)
  text(`project id: ${calculatie.project_id}`, 350, 690)
  text(`calculatie id: ${calculatie.id}`, 350, 674)
  text(`datum: ${new Date().toLocaleDateString("nl-NL")}`, 350, 658)

  /*
  ========================
  calculatiepagina
  ========================
  */
  const page = pdf.addPage([595, 842])
  let y = 800

  const line = (t, size = 10) => {
    page.drawText(String(t), {
      x: 40,
      y,
      size,
      font,
      color: rgb(0, 0, 0)
    })
    y -= size + 6
  }

  line("calculatie – 2jours", 16)
  y -= 10

  line("posten", 12)

  regels.forEach(r => {
    const sub = Number(r.hoeveelheid) * Number(r.eenheidsprijs)
    line(
      `${r.omschrijving} | ${r.hoeveelheid} x ${euro(
        r.eenheidsprijs
      )} = ${euro(sub)} | btw ${r.btw_tarief}%`
    )
  })

  y -= 16
  line("totaal", 12)
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

async function uploadPdf(project_id, pdfBytes) {
  const path = `${project_id}/calculatie_2jours.pdf`

  const { error } = await supabase.storage
    .from("sterkcalc")
    .upload(path, pdfBytes, {
      contentType: "application/pdf",
      upsert: true
    })

  assert(!error, "pdf_upload_failed")
  return path
}

/*
===========================================================
entrypoint
===========================================================
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
        error: "no_project_id",
        finished_at: new Date().toISOString()
      })
      .eq("id", task.id)
    return
  }

  const { data: doneCalc } = await supabase
    .from("calculaties")
    .select("id")
    .eq("project_id", project_id)
    .eq("workflow_status", "done")
    .limit(1)
    .maybeSingle()

  if (doneCalc) {
    await supabase
      .from("executor_tasks")
      .update({
        status: "skipped",
        finished_at: new Date().toISOString()
      })
      .eq("id", task.id)
    return
  }

  try {
    const calculatie = await getOrCreateCalculatie(project_id)
    const regels = await fetchStabuRegels(project_id)

    let kostprijs = 0
    let btw9 = 0
    let btw21 = 0

    regels.forEach(r => {
      const sub = Number(r.hoeveelheid) * Number(r.eenheidsprijs)
      kostprijs += sub
      if (Number(r.btw_tarief) === 9) btw9 += sub * 0.09
      if (Number(r.btw_tarief) === 21) btw21 += sub * 0.21
    })

    const ak = kostprijs * ak_pct
    const abk = kostprijs * abk_pct
    const wr = kostprijs * wr_pct

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

    const pdfPath = await uploadPdf(project_id, pdfBytes)

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

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
  const { data: existing, error } = await supabase
    .from("calculaties")
    .select("*")
    .eq("project_id", project_id)
    .order("created_at", { ascending: false })
    .limit(1)

  if (error) throw error
  if (existing && existing.length) return existing[0]

  const { data, error: insertErr } = await supabase
    .from("calculaties")
    .insert({
      project_id,
      workflow_status: "running"
    })
    .select("*")
    .single()

  if (insertErr) throw insertErr
  return data
}

/*
===========================================================
STABU REGELS
===========================================================
*/
async function fetchStabuRegels(project_id) {
  const { data, error } = await supabase
    .from("stabu_result_regels")
    .select("*")
    .eq("project_id", project_id)

  if (error) throw error
  if (!Array.isArray(data) || !data.length) {
    throw new Error("no_stabu_regels")
  }

  return data
}

/*
===========================================================
SYNC → CALCULATIE_REGELS  (ESSENTIEEL)
===========================================================
*/
async function syncCalculatieRegels(calculatie_id, regels) {
  await supabase
    .from("calculatie_regels")
    .delete()
    .eq("calculatie_id", calculatie_id)

  const inserts = regels.map(r => ({
    calculatie_id,
    stabu_id: r.id ?? null,
    hoeveelheid: r.hoeveelheid ?? 1,
    eenheid: r.eenheid ?? "st",
    materiaalprijs: r.eenheidsprijs ?? 0,
    arbeidsprijs: 0,
    normuren: 0,
    loonkosten: 0,
    totaal: (r.hoeveelheid ?? 1) * (r.eenheidsprijs ?? 0)
  }))

  const { error } = await supabase
    .from("calculatie_regels")
    .insert(inserts)

  if (error) throw error
}

/*
===========================================================
PDF GENERATIE
===========================================================
*/
async function generatePdf(calculatie, regels, totalen) {
  const pdf = await PDFDocument.create()
  const font = await pdf.embedFont(StandardFonts.Helvetica)

  const cover = pdf.addPage([595, 842])

  const draw = (t, x, y, size = 10) =>
    cover.drawText(String(t), { x, y, size, font, color: rgb(0, 0, 0) })

  draw("SterkBouw B.V.", 40, 720, 14)
  draw("Calculatie 2jours", 350, 720, 14)
  draw(`Project: ${calculatie.project_id}`, 40, 690)
  draw(`Calculatie: ${calculatie.id}`, 40, 675)

  const page = pdf.addPage([595, 842])
  let y = 800

  regels.forEach(r => {
    const sub = (r.hoeveelheid ?? 1) * (r.eenheidsprijs ?? 0)
    page.drawText(
      `${r.omschrijving} | ${euro(sub)}`,
      { x: 40, y, size: 10, font }
    )
    y -= 14
  })

  y -= 20
  page.drawText(`Kostprijs: ${euro(totalen.kostprijs)}`, { x: 40, y, size: 11, font })

  return pdf.save()
}

/*
===========================================================
PDF OPSLAAN + SIGNED URL
===========================================================
*/
async function storePdf(project_id, pdfBytes) {
  const path = `${project_id}/calculatie_2jours.pdf`

  await supabase.storage
    .from("sterkcalc")
    .upload(path, pdfBytes, { upsert: true, contentType: "application/pdf" })

  const { data } = await supabase.storage
    .from("sterkcalc")
    .createSignedUrl(path, 3600)

  if (data?.signedUrl) {
    await supabase
      .from("projects")
      .update({ pdf_url: data.signedUrl })
      .eq("id", project_id)
  }
}

/*
===========================================================
ENTRYPOINT
===========================================================
*/
export async function handleStartRekenwolk(task) {
  if (!task?.id || !task.project_id) return

  const taskId = task.id
  const project_id = task.project_id

  try {
    await supabase
      .from("executor_tasks")
      .update({ status: "running" })
      .eq("id", taskId)

    const calculatie = await getOrCreateCalculatie(project_id)
    const regels = await fetchStabuRegels(project_id)

    await syncCalculatieRegels(calculatie.id, regels)

    let kostprijs = 0
    regels.forEach(r => {
      kostprijs += (r.hoeveelheid ?? 1) * (r.eenheidsprijs ?? 0)
    })

    const totalen = {
      kostprijs,
      ak: kostprijs * AK_PCT,
      abk: kostprijs * ABK_PCT,
      wr: kostprijs * WR_PCT
    }

    const pdfBytes = await generatePdf(calculatie, regels, totalen)
    await storePdf(project_id, pdfBytes)

    await supabase
      .from("calculaties")
      .update({
        workflow_status: "done",
        kostprijs,
        verkoopprijs: kostprijs + totalen.ak + totalen.abk + totalen.wr,
        marge: totalen.ak + totalen.abk + totalen.wr
      })
      .eq("id", calculatie.id)

    await supabase
      .from("executor_tasks")
      .update({ status: "completed" })
      .eq("id", taskId)

  } catch (err) {
    await supabase
      .from("executor_tasks")
      .update({
        status: "failed",
        error: err.message
      })
      .eq("id", taskId)
    throw err
  }
}

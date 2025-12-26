import { createClient } from "@supabase/supabase-js"
import pkg from "pdf-lib"

const { PDFDocument, rgb, StandardFonts } = pkg

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
)

/*
===========================================================
REKENWOLK – DEFINITIEF EINDSTATION
- vereist STABU
- maakt calculatie
- genereert 2jours PDF
- zet workflow definitief op DONE
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
  if (!Array.isArray(data) || data.length === 0) {
    throw new Error("NO_STABU_REGELS")
  }

  return data
}

/*
===========================================================
SYNC → CALCULATIE_REGELS
===========================================================
*/
async function syncCalculatieRegels(calculatie_id, regels) {
  await supabase
    .from("calculatie_regels")
    .delete()
    .eq("calculatie_id", calculatie_id)

  const inserts = regels.map(r => ({
    calculatie_id,
    stabu_id: r.id,
    hoeveelheid: r.hoeveelheid || 1,
    eenheid: r.eenheid || "st",
    materiaalprijs: r.eenheidsprijs || 0,
    arbeidsprijs: 0,
    normuren: 0,
    loonkosten: 0,
    totaal: (r.hoeveelheid || 1) * (r.eenheidsprijs || 0)
  }))

  const { error } = await supabase
    .from("calculatie_regels")
    .insert(inserts)

  if (error) throw error
}

/*
===========================================================
PDF GENERATIE – 2JOURS
===========================================================
*/
async function generatePdf(calculatie, regels, totalen) {
  const pdf = await PDFDocument.create()
  const font = await pdf.embedFont(StandardFonts.Helvetica)

  const page1 = pdf.addPage([595, 842])

  const draw = (t, x, y, size = 10) =>
    page1.drawText(String(t), { x, y, size, font, color: rgb(0, 0, 0) })

  draw("SterkBouw B.V.", 40, 780, 14)
  draw("2jours Offerte – Calculatie", 350, 780, 14)
  draw(`Project: ${calculatie.project_id}`, 40, 750)
  draw(`Calculatie: ${calculatie.id}`, 40, 735)

  let y = 700
  regels.forEach(r => {
    const sub = (r.hoeveelheid || 1) * (r.eenheidsprijs || 0)
    page1.drawText(
      `${r.omschrijving} — ${euro(sub)}`,
      { x: 40, y, size: 10, font }
    )
    y -= 14
  })

  y -= 20
  page1.drawText(`Kostprijs: ${euro(totalen.kostprijs)}`, { x: 40, y, size: 11, font })
  y -= 14
  page1.drawText(`Verkoopprijs: ${euro(totalen.verkoopprijs)}`, { x: 40, y, size: 11, font })

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
    .upload(path, pdfBytes, {
      upsert: true,
      contentType: "application/pdf"
    })

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
ENTRYPOINT – EINDE WORKFLOW
===========================================================
*/
export async function handleStartRekenwolk(task) {
  if (!task?.id || !task.project_id) return

  const taskId = task.id
  const project_id = task.project_id
  const now = new Date().toISOString()

  try {
    /*
    ============================
    TASK → RUNNING
    ============================
    */
    await supabase
      .from("executor_tasks")
      .update({
        status: "running",
        started_at: now
      })
      .eq("id", taskId)

    /*
    ============================
    CALCULATIE + STABU
    ============================
    */
    const calculatie = await getOrCreateCalculatie(project_id)
    const regels = await fetchStabuRegels(project_id)

    await syncCalculatieRegels(calculatie.id, regels)

    /*
    ============================
    TOTALEN
    ============================
    */
    let kostprijs = 0
    regels.forEach(r => {
      kostprijs += (r.hoeveelheid || 1) * (r.eenheidsprijs || 0)
    })

    const verkoopprijs =
      kostprijs +
      kostprijs * AK_PCT +
      kostprijs * ABK_PCT +
      kostprijs * WR_PCT

    /*
    ============================
    PDF
    ============================
    */
    const pdfBytes = await generatePdf(
      calculatie,
      regels,
      { kostprijs, verkoopprijs }
    )

    await storePdf(project_id, pdfBytes)

    /*
    ============================
    AFRONDEN CALCULATIE
    ============================
    */
    await supabase
      .from("calculaties")
      .update({
        workflow_status: "done",
        kostprijs,
        verkoopprijs,
        marge: verkoopprijs - kostprijs
      })
      .eq("id", calculatie.id)

    /*
    ============================
    TASK → COMPLETED
    ============================
    */
    await supabase
      .from("executor_tasks")
      .update({
        status: "completed",
        finished_at: now
      })
      .eq("id", taskId)

  } catch (err) {
    await supabase
      .from("executor_tasks")
      .update({
        status: "failed",
        error: err.message,
        finished_at: new Date().toISOString()
      })
      .eq("id", taskId)
  }
}

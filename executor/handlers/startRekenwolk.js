import { createClient } from "@supabase/supabase-js"
import { PDFDocument, rgb, StandardFonts } from "pdf-lib"

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
)

/*
===========================================================
REKENWOLK – STERKCALC DEFINITIEVE BASISVERSIE
===========================================================
- Eén rekenwolk per project
- Idempotent uitgevoerd
- Executor task wordt altijd afgerond
===========================================================
*/

function assert(cond, msg) {
  if (!cond) throw new Error(msg)
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
LEGE 2JOURS PDF
========================
*/
async function generateEmpty2JoursPdf(calculatie) {
  const pdf = await PDFDocument.create()
  const page = pdf.addPage([595, 842])
  const font = await pdf.embedFont(StandardFonts.Helvetica)

  let y = 800
  const line = (t, size = 10) => {
    page.drawText(t, { x: 40, y, size, font, color: rgb(0, 0, 0) })
    y -= size + 6
  }

  line("CALCULATIE – 2JOURS", 16)
  y -= 20

  line(`Project ID: ${calculatie.project_id}`)
  line(`Calculatie ID: ${calculatie.id}`)
  y -= 20

  line("STATUS", 12)
  line("Analyse afgerond.")
  line("STABU en hoeveelheden volgen na verdere analyse.")
  y -= 20

  line("RESULTAAT", 12)
  line("Kostprijs: € 0,00")
  line("Verkoopprijs: € 0,00")
  line("Marge: € 0,00")

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
  ========================
  IDEMPOTENT GUARD
  ========================
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
    /*
    ========================
    CALCULATIE GARANTEREN
    ========================
    */
    const calculatie = await getOrCreateCalculatie(project_id)

    /*
    ========================
    PDF GENEREREN
    ========================
    */
    const pdfBytes = await generateEmpty2JoursPdf(calculatie)
    const pdfPath = await uploadPdf(project_id, pdfBytes)

    /*
    ========================
    CALCULATIE AFRONDEN
    ========================
    */
    await supabase
      .from("calculaties")
      .update({
        workflow_status: "done",
        pdf_path: pdfPath,
        kostprijs: 0,
        verkoopprijs: 0,
        marge: 0
      })
      .eq("id", calculatie.id)

    /*
    ========================
    PROJECT STATUS
    ========================
    */
    await supabase
      .from("projects")
      .update({
        analysis_status: "completed",
        updated_at: new Date().toISOString()
      })
      .eq("id", project_id)

    /*
    ========================
    EXECUTOR TASK AFRONDEN
    ========================
    */
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

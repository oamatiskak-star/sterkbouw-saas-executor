import { createClient } from "@supabase/supabase-js"
import { TwoJoursWriter } from "../../builder/pdf/TwoJoursWriter.js"

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
)

// OPSLAGEN – STRICT GESCHEIDEN
const AK_PCT = 0.08        // Algemene kosten
const ABK_PCT = 0.06       // Algemene bedrijfskosten
const WINST_PCT = 0.05     // Winst
const RISICO_PCT = 0.03    // Risico

/*
=====================================
CALCULATIE GARANTEREN
=====================================
*/
async function ensureCalculatie(project_id) {
  const { data: existing, error } = await supabase
    .from("calculaties")
    .select("id")
    .eq("project_id", project_id)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle()

  if (error) {
    throw new Error("CALCULATIE_LOOKUP_FAILED: " + error.message)
  }

  if (existing) return existing.id

  const { data: created, error: insertErr } = await supabase
    .from("calculaties")
    .insert({
      project_id,
      workflow_status: "initialized",
      created_at: new Date().toISOString()
    })
    .select("id")
    .single()

  if (insertErr) {
    throw new Error("CALCULATIE_CREATE_FAILED: " + insertErr.message)
  }

  return created.id
}

export async function handleStartRekenwolk(task) {
  if (!task?.id || !task.project_id) return

  const taskId = task.id
  const project_id = task.project_id
  const now = new Date().toISOString()

  try {
    /* TASK → RUNNING */
    await supabase
      .from("executor_tasks")
      .update({ status: "running", started_at: now })
      .eq("id", taskId)

    /* CALCULATIE BESTAAT */
    await ensureCalculatie(project_id)

    /*
    =================================================
    1. STABU POSTEN OPHALEN
    =================================================
    */
    const { data: posten, error } = await supabase
      .from("stabu_posten")
      .select(`
        id,
        code,
        omschrijving,
        eenheid,
        normuren,
        arbeidsprijs,
        materiaalprijs
      `)

    if (error) throw error
    if (!Array.isArray(posten) || posten.length === 0) {
      throw new Error("NO_STABU_POSTEN")
    }

    /*
    =================================================
    2. REKENWOLK
    =================================================
    */
    const regels = []
    let kostprijs = 0

    for (const p of posten) {
      const hoeveelheid = 1
      const loonkosten = (p.normuren || 0) * (p.arbeidsprijs || 0)
      const materiaalkosten = (p.materiaalprijs || 0) * hoeveelheid
      const totaal = loonkosten + materiaalkosten

      kostprijs += totaal

      regels.push({
        stabu_code: p.code,
        omschrijving: p.omschrijving,
        hoeveelheid,
        eenheid: p.eenheid,
        normuren: p.normuren,
        loonkosten,
        materiaalprijs: p.materiaalprijs,
        totaal
      })
    }

    /*
    =================================================
    3. OPSLAGEN – LOS BEREKEND
    =================================================
    */
    const ak = kostprijs * AK_PCT
    const abk = kostprijs * ABK_PCT
    const winst = kostprijs * WINST_PCT
    const risico = kostprijs * RISICO_PCT

    const verkoopprijs =
      kostprijs + ak + abk + winst + risico

    /*
    =================================================
    4. PDF GENEREREN (HUIDIGE TwoJoursWriter API)
    =================================================
    */
    const pdf = await TwoJoursWriter.open(project_id)

    pdf.drawCalculatieRegels(regels, {
      kostprijs,
      ak,
      abk,
      winst,
      risico,
      verkoopprijs
    })

    pdf.drawStaartblad()

    const pdfUrl = await pdf.save()

    await supabase
      .from("projects")
      .update({ pdf_url: pdfUrl })
      .eq("id", project_id)

    /* TASK → COMPLETED */
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

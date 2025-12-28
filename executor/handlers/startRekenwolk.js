import { createClient } from "@supabase/supabase-js"
import { TwoJoursWriter } from "../../builder/pdf/TwoJoursWriter.js"

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
)

// OPSLAGEN – STRICT GESCHEIDEN
const AK_PCT = 0.08
const ABK_PCT = 0.06
const WINST_PCT = 0.05
const RISICO_PCT = 0.03

async function ensureCalculatie(project_id) {
  const { data: existing, error } = await supabase
    .from("calculaties")
    .select("id")
    .eq("project_id", project_id)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle()

  if (error) throw error
  if (existing) return existing.id

  const { data, error: insertErr } = await supabase
    .from("calculaties")
    .insert({
      project_id,
      workflow_status: "initialized",
      created_at: new Date().toISOString()
    })
    .select("id")
    .single()

  if (insertErr) throw insertErr
  return data.id
}

export async function handleStartRekenwolk(task) {
  if (!task?.id || !task.project_id) return

  const taskId = task.id
  const project_id = task.project_id
  const now = new Date().toISOString()

  try {
    await supabase
      .from("executor_tasks")
      .update({ status: "running", started_at: now })
      .eq("id", taskId)

    await ensureCalculatie(project_id)

    /*
    =================================================
    1. STABU POSTEN – ALLE KOLOMMEN
    =================================================
    */
    const { data: posten, error } = await supabase
      .from("stabu_posten")
      .select("*")

    if (error) throw error
    if (!Array.isArray(posten) || posten.length === 0) {
      throw new Error("NO_STABU_POSTEN")
    }

    /*
    =================================================
    2. REKENWOLK (VOLLEDIGE KOLMMAPPING)
    =================================================
    */
    const regels = []
    let kostprijs = 0

    for (const p of posten) {
      const hoeveelheid = p.hoeveelheid ?? 1
      const normuren = p.normuren ?? 0
      const uren = normuren
      const loonkosten = uren * (p.arbeidsprijs ?? 0)
      const materiaal = (p.materiaalprijs ?? 0) * hoeveelheid
      const totaal = loonkosten + materiaal
      kostprijs += totaal

      regels.push({
        stabu_code: p.code,
        omschrijving: p.omschrijving,
        hoeveelheid,
        eenheid: p.eenheid,

        normuren,
        uren,

        loonkosten,
        prijs_eenh: hoeveelheid ? totaal / hoeveelheid : 0,
        materiaalprijs: p.materiaalprijs,
        materiaal,

        oa_perc: p.oa_perc ?? null,
        oa: p.oa ?? 0,

        stelp_eenh: p.stelp_eenh ?? null,
        stelposten: p.stelposten ?? 0,

        totaal
      })
    }

    /*
    =================================================
    3. PROJECTTOTALEN
    =================================================
    */
    const ak = kostprijs * AK_PCT
    const abk = kostprijs * ABK_PCT
    const winst = kostprijs * WINST_PCT
    const risico = kostprijs * RISICO_PCT
    const verkoopprijs = kostprijs + ak + abk + winst + risico

    /*
    =================================================
    4. PDF
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

    await supabase
      .from("executor_tasks")
      .update({ status: "completed", finished_at: now })
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

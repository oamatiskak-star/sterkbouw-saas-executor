import { createClient } from "@supabase/supabase-js"
import { TwoJoursWriter } from "../../builder/pdf/TwoJoursWriter.js"

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
)

const AK_PCT = 0.08
const ABK_PCT = 0.06
const WR_PCT = 0.08

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

    /*
    =================================================
    1. STABU BASIS OPHALEN (POSTEN + NORMEN + PRIJZEN)
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
        materiaalprijs,
        arbeidsprijs
      `)

    if (error) throw error
    if (!posten || posten.length === 0) {
      throw new Error("NO_STABU_POSTEN")
    }

    /*
    =================================================
    2. RESULTREGELS OPBOUWEN
    =================================================
    */
    const resultRegels = []
    const calculatieRegels = []

    let kostprijs = 0

    for (const p of posten) {
      const hoeveelheid = 1
      const loonkosten = (p.normuren || 0) * (p.arbeidsprijs || 0)
      const materiaalkosten = (p.materiaalprijs || 0) * hoeveelheid
      const totaal = loonkosten + materiaalkosten

      kostprijs += totaal

      resultRegels.push({
        project_id,
        stabu_id: p.id,
        stabu_code: p.code,
        omschrijving: p.omschrijving,
        hoeveelheid,
        eenheid: p.eenheid,
        normuren: p.normuren,
        loonkosten,
        materiaalprijs: p.materiaalprijs,
        totaal
      })

      calculatieRegels.push({
        project_id,
        stabu_id: p.id,
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
    3. OPSLAAN STABU_RESULT_REGELS
    =================================================
    */
    await supabase
      .from("stabu_result_regels")
      .delete()
      .eq("project_id", project_id)

    await supabase
      .from("stabu_result_regels")
      .insert(resultRegels)

    /*
    =================================================
    4. OPSLAAN CALCULATIE_REGELS
    =================================================
    */
    await supabase
      .from("calculatie_regels")
      .delete()
      .eq("project_id", project_id)

    await supabase
      .from("calculatie_regels")
      .insert(calculatieRegels)

    /*
    =================================================
    5. TOTALEN
    =================================================
    */
    const verkoopprijs =
      kostprijs +
      kostprijs * AK_PCT +
      kostprijs * ABK_PCT +
      kostprijs * WR_PCT

    /*
    =================================================
    6. PDF VULLEN (NU PAS)
    =================================================
    */
    const pdf = await TwoJoursWriter.open(project_id)

    await pdf.writeSection("stabu.rekenwolk", {
      titel: "STABU Calculatie",
      regels: resultRegels,
      totalen: {
        kostprijs,
        verkoopprijs
      }
    })

    const pdfUrl = await pdf.finalize()

    await supabase
      .from("projects")
      .update({ pdf_url: pdfUrl })
      .eq("id", project_id)

    /* TASK → COMPLETED */
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

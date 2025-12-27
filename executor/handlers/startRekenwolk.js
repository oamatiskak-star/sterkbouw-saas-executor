import { createClient } from "@supabase/supabase-js"
import { TwoJoursWriter } from "../../builder/pdf/TwoJoursWriter.js"

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
)

/*
===========================================================
REKENWOLK – DEFINITIEF
- vult STABU-regels met project-specifieke data
- schrijft ALLES in bestaande 2jours-PDF
- finaliseert PDF
===========================================================
*/

const AK_PCT = 0.08
const ABK_PCT = 0.06
const WR_PCT = 0.08

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
    STABU REGELS OPHALEN
    ============================
    */
    const { data: regels, error } = await supabase
      .from("stabu_result_regels")
      .select("*")
      .eq("project_id", project_id)

    if (error) throw error
    if (!regels || regels.length === 0) {
      throw new Error("NO_STABU_REGELS")
    }

    /*
    ============================
    REKENWOLK – PROJECT INVULLING
    (DIT WORDT LATER VERVANGEN
     DOOR ECHTE SCAN-LOGICA)
    ============================
    */
    let kostprijs = 0

    const ingevuldeRegels = regels.map(r => {
      const hoeveelheid = r.hoeveelheid ?? 1
      const subtotaal = hoeveelheid * (r.eenheidsprijs || 0)
      kostprijs += subtotaal

      return {
        id: r.id,
        stabu_code: r.stabu_code,
        omschrijving: r.omschrijving,
        norm: r.norm,
        hoeveelheid,
        eenheidsprijs: r.eenheidsprijs,
        subtotaal
      }
    })

    const verkoopprijs =
      kostprijs +
      kostprijs * AK_PCT +
      kostprijs * ABK_PCT +
      kostprijs * WR_PCT

    /*
    ============================
    2JOURS PDF – INVULLEN + AFRONDEN
    ============================
    */
    const pdf = await TwoJoursWriter.open(project_id)

    await pdf.writeSection("stabu.invulling", {
      titel: "Project-specifieke invulling",
      regels: ingevuldeRegels,
      totalen: {
        kostprijs,
        verkoopprijs
      }
    })

    const pdfUrl = await pdf.finalize()

    /*
    ============================
    PROJECT PDF LINK
    ============================
    */
    await supabase
      .from("projects")
      .update({
        pdf_url: pdfUrl
      })
      .eq("id", project_id)

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

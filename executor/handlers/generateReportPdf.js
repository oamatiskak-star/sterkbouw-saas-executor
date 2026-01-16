import supabase from "../../lib/supabase.js";



function assert(cond, msg) {
  if (!cond) throw new Error(msg)
}

export async function handleGenerateReportPdf(task) {
  assert(task && (task.project_id || task.payload?.project_id), "PDF_NO_PROJECT_ID")
  const project_id = task.project_id || task.payload.project_id

  /*
  ============================
  START LOG
  ============================
  */
  await supabase.from("project_initialization_log").insert({
    project_id,
    module: "RAPPORT_PDF",
    status: "running",
    started_at: new Date().toISOString()
  })

  /*
  ============================
  ACTIEVE CALCULATIE
  ============================
  */
  const { data: calculatie, error: calcErr } = await supabase
    .from("calculaties")
    .select("id, kostprijs, verkoopprijs, marge")
    .eq("project_id", project_id)
    .order("created_at", { ascending: false })
    .limit(1)
    .single()

  assert(!calcErr && calculatie, "PDF_NO_CALCULATIE")
  const calculatie_id = calculatie.id

  /*
  ============================
  INPUT DATA CONTROLE
  ============================
  */
  const { data: regels, error: regelsErr } = await supabase
    .from("calculatie_regels")
    .select("id")
    .eq("calculatie_id", calculatie_id)
    .limit(1)

  assert(!regelsErr, "PDF_REGELS_FETCH_FAILED")
  assert(regels && regels.length > 0, "PDF_NO_REGELS")

  const { data: risico, error: risicoErr } = await supabase
    .from("project_risicos")
    .select("id")
    .eq("project_id", project_id)
    .limit(1)

  assert(!risicoErr, "PDF_RISICO_FETCH_FAILED")
  assert(risico && risico.length > 0, "PDF_NO_RISICO")

  /*
  ============================
  PDF METADATA
  ============================
  */
  const metadata = {
    kostprijs: Number(calculatie.kostprijs || 0),
    verkoopprijs: Number(calculatie.verkoopprijs || 0),
    marge: Number(calculatie.marge || 0),
    gegenereerd_op: new Date().toISOString(),
    formaat: "2jours"
  }

  /*
  ============================
  OUDE PDF OPSCHONEN
  ============================
  */
  await supabase
    .from("project_reports")
    .delete()
    .eq("project_id", project_id)
    .eq("report_type", "pdf")

  /*
  ============================
  PDF REGISTREREN
  ============================
  */
  const { error: insertPdfErr } = await supabase
    .from("project_reports")
    .insert({
      project_id,
      calculatie_id,
      report_type: "pdf",
      status: "generated",
      generated_at: new Date().toISOString(),
      metadata
    })

  assert(!insertPdfErr, "PDF_INSERT_FAILED")

  /*
  ============================
  CALCULATIE DEFINITIEF
  ============================
  */
  const { error: calcUpdateErr } = await supabase
    .from("calculaties")
    .update({
      workflow_status: "done",
      status: "final"
    })
    .eq("id", calculatie_id)

  assert(!calcUpdateErr, "PDF_CALCULATIE_UPDATE_FAILED")

  /*
  ============================
  LOG DONE
  ============================
  */
  await supabase
    .from("project_initialization_log")
    .update({
      status: "done",
      finished_at: new Date().toISOString()
    })
    .eq("project_id", project_id)
    .eq("module", "RAPPORT_PDF")

  /*
  ============================
  SLUIT TASK
  ============================
  */
  if (task.id) {
    await supabase
      .from("executor_tasks")
      .update({ status: "done" })
      .eq("id", task.id)
  }

  return {
    state: "DONE",
    project_id,
    calculatie_id,
    pdf: "generated"
  }
}

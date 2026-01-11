import { createClient } from "@supabase/supabase-js"
import { sendTelegram } from "../integrations/telegramSender.js"

// PDF = SYSTEM OF RECORD (INTERNE FUNCTIE)
import { generate2joursPdf } from "./pdf/generate2joursPdf.js"

// PURE HANDLERS (ALLEEN DATA)
import { handleUploadFiles } from "./handlers/uploadFiles.js"
import { handleProjectScan } from "./handlers/projectScan.js"
import { handleGenerateStabu } from "./handlers/generateStabu.js"
import { handleStartRekenwolk } from "./handlers/startRekenwolk.js"
import { handlePlanning } from "./handlers/handlePlanning.js"
import { handleGenerateRiskReport } from "./handlers/generateRiskReport.js"
import { handleGenerateReportPdf } from "./handlers/generateReportPdf.js"
import { handleFinalizeRekenwolk } from "./handlers/finalizeRekenwolk.js"

// MONTEUR / BUILDER
import { runBuilder } from "../builder/index.js"

import { startCalculationFromRun } from "./actions/startCalculationFromRun.js"

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
)

const CALCULATION_STATES = {
  DATA_ANALYSED: "DATA_ANALYSED",
  STABU_DRAFT: "STABU_DRAFT",
  CALCULATED: "CALCULATED",
  OFFER_READY: "OFFER_READY"
}

function log(...args) {
  console.log("[EXECUTOR]", ...args)
}

function normalize(raw) {
  if (!raw || typeof raw !== "string") return null
  return raw.toLowerCase().replace(/[^a-z0-9_]+/g, "_")
}

/*
====================================================
HARD CONTRACT – NO EXCEPTIONS
====================================================
1. PDF bestaat DIRECT na upload
2. Elke task schrijft naar DEZELFDE PDF
3. Geen enkele stap mag door zonder PDF-write
4. PDF is leidend, database volgt
====================================================
*/

export async function runAction(task) {
  if (!task || !task.id) {
    throw new Error("RUNACTION_INVALID_TASK")
  }

  const payload =
    task.payload && typeof task.payload === "object" ? task.payload : {}

  const action = normalize(
    task.action ||
    task.action_id ||
    payload.actionId ||
    payload.action ||
    null
  )

  if (!action) {
    throw new Error("ACTION_MISSING")
  }

  const project_id =
    task.project_id ||
    payload.project_id ||
    null

  if (!project_id) {
    throw new Error("PROJECT_ID_MISSING")
  }

  log("TASK_START", {
    id: task.id,
    action,
    project_id
  })

  /*
  ==================================================
  0. MONTEUR / SYSTEM REPAIR (BUILDER)
  ==================================================
  */
  if (
    action === "system_repair_full_chain" ||
    action === "system_repair_full" ||
    action === "repair_full_system" ||
    action === "system_full_scan"
  ) {

    const result = await runBuilder({
      ...payload,
      action,
      project_id,
      task_id: task.id
    })

    log("SYSTEM_REPAIR_DONE", { action })
    return { state: "DONE", action, result }
  }

  /*
  ==================================================
  1. UPLOAD FILES
  ==================================================
  */
  if (action === "upload" || action === "upload_files") {

    await handleUploadFiles({
      id: task.id,
      project_id,
      payload
    })

    // HARD CONTRACT: PDF MOET DIRECT BESTAAN
    await generate2joursPdf(project_id)

    log("UPLOAD_DONE + PDF_CREATED")
    return { state: "DONE", action }
  }

  /*
  ==================================================
  2. PROJECT SCAN / ANALYSE
  ==================================================
  */
  if (action === "project_scan" || action === "analysis") {

    await handleProjectScan({
      id: task.id,
      project_id,
      payload
    })

    // PDF BIJWERKEN MET SCANRESULTAAT
    await generate2joursPdf(project_id)

    await supabase
      .from("calculation_state")
      .upsert({
        project_id,
        state: CALCULATION_STATES.DATA_ANALYSED,
        updated_at: new Date().toISOString()
      }, { onConflict: "project_id" })

    log("PROJECT_SCAN_DONE + PDF_UPDATED")
    return { state: "DONE", action }
  }

  /*
  ==================================================
  3. GENERATE STABU
  ==================================================
  */
  if (action === "generate_stabu") {

    await handleGenerateStabu({
      id: task.id,
      project_id,
      payload
    })

    // STABU → PDF
    await generate2joursPdf(project_id)

    await supabase
      .from("calculation_state")
      .upsert({
        project_id,
        state: CALCULATION_STATES.STABU_DRAFT,
        updated_at: new Date().toISOString()
      }, { onConflict: "project_id" })

    log("GENERATE_STABU_DONE + PDF_UPDATED")
    return { state: "DONE", action }
  }

  /*
  ==================================================
  4. START REKENWOLK (EINDPRODUCT)
  ==================================================
  */
  if (action === "start_rekenwolk") {

    let enrichedPayload = { ...payload };

    // DEFENSIVE CODING: If calculation_run_id is missing, find the latest one for the project.
    if (!enrichedPayload.calculation_run_id) {
      log("PAYLOAD_MISSING_RUN_ID: Searching for latest calculation_run_id for project", project_id);
      const { data: latestRun, error: runError } = await supabase
        .from('calculation_runs')
        .select('id')
        .eq('project_id', project_id)
        .order('created_at', { ascending: false })
        .limit(1)
        .single();
      
      if (runError && runError.code !== 'PGRST116') { // Ignore 'exact one row not found'
        throw new Error(`Could not find a calculation run for project ${project_id}: ${runError.message}`);
      }
      if (!latestRun) {
        throw new Error(`No calculation run found for project ${project_id}. Cannot proceed.`);
      }

      log("PAYLOAD_ENRICHED: Found and added calculation_run_id", latestRun.id);
      enrichedPayload.calculation_run_id = latestRun.id;
    }

    await handleStartRekenwolk({
      id: task.id,
      project_id,
      payload: enrichedPayload
    });


    // FINAL PDF
    const pdfResult = await generate2joursPdf(project_id)

    if (enrichedPayload.calculation_run_id && pdfResult?.pdf_url) {
      await supabase
        .from("calculation_runs")
        .update({
          status: "completed",
          current_step: "completed",
          pdf_url: pdfResult.pdf_url,
          updated_at: new Date().toISOString()
        })
        .eq("id", enrichedPayload.calculation_run_id)
    }

    await supabase
      .from("calculation_state")
      .upsert({
        project_id,
        state: CALCULATION_STATES.CALCULATED,
        updated_at: new Date().toISOString()
      }, { onConflict: "project_id" })

    log("REKENWOLK_DONE + FINAL_PDF")
    return { state: "DONE", action }
  }

  /*
  ==================================================
  5. RISICO ANALYSE
  ==================================================
  */
  if (action === "generate_risk_report") {
    await handleGenerateRiskReport({
      id: task.id,
      project_id,
      payload
    })

    log("RISK_REPORT_DONE")
    return { state: "DONE", action }
  }

  /*
  ==================================================
  6. PLANNING / TERMIJNSCHEMA
  ==================================================
  */
  if (action === "planning") {
    await handlePlanning({
      id: task.id,
      project_id,
      payload
    })

    log("PLANNING_DONE")
    return { state: "DONE", action }
  }

  /*
  ==================================================
  7. FINALIZE REKENWOLK
  ==================================================
  */
  if (action === "finalize_rekenwolk") {
    await handleFinalizeRekenwolk({
      id: task.id,
      project_id,
      payload
    })

    log("FINALIZE_REKENWOLK_DONE")
    return { state: "DONE", action }
  }

  /*
  ==================================================
  8. RAPPORTAGE PDF
  ==================================================
  */
  if (action === "rapportage" || action === "generate_report_pdf") {
    await handleGenerateReportPdf({
      id: task.id,
      project_id,
      payload
    })

    await supabase
      .from("calculation_state")
      .upsert({
        project_id,
        state: CALCULATION_STATES.OFFER_READY,
        updated_at: new Date().toISOString()
      }, { onConflict: "project_id" })

    log("REPORT_PDF_DONE")
    return { state: "DONE", action }
  }

  /*
  ==================================================
  5. START CALCULATION (CALCULATION_RUNS)
  ==================================================
  */
  if (action === "start_calculation") {

    await startCalculationFromRun({
      task_id: task.id,
      project_id,
      payload
    });

    log("START_CALCULATION_STUB_DONE", {
      task_id: task.id,
      project_id
    });

    return { state: "DONE", action };
  }

  /*
  ==================================================
  ONBEKENDE ACTIE = HARD STOP
  ==================================================
  */
  throw new Error(`UNSUPPORTED_ACTION: ${action}`)
}

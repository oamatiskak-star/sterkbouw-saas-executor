import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

/**
 * startCalculationFromRun
 *
 * Verantwoordelijkheid:
 * - startpunt vanuit UI
 * - zet de calculatie-workflow klaar
 * - maakt vervolg executor_tasks aan
 *
 * Architectuur:
 * - deze functie rekent NIET
 * - deze functie maakt GEEN PDF
 * - deze functie start ALLEEN de keten
 */
export async function startCalculationFromRun({ task_id, project_id, payload }) {
  if (!task_id) {
    throw new Error("START_CALCULATION_MISSING_TASK_ID");
  }

  if (!project_id) {
    throw new Error("START_CALCULATION_MISSING_PROJECT_ID");
  }

  const activeStatuses = [
    "queued",
    "running",
    "scanning",
    "calculating",
    "analysing_documents",
    "generating_stabu",
    "scan_completed"
  ];

  const { data: existingByTask, error: existingByTaskError } = await supabase
    .from("calculation_runs")
    .select("id, status")
    .eq("source_task_id", task_id)
    .limit(1)
    .maybeSingle();

  if (existingByTaskError) {
    throw new Error(`CALCULATION_RUN_CHECK_FAILED: ${existingByTaskError.message}`);
  }

  if (existingByTask?.id) {
    return {
      state: "ALREADY_STARTED",
      calculation_run_id: existingByTask.id
    };
  }

  const { data: existingRun, error: existingRunError } = await supabase
    .from("calculation_runs")
    .select("id, status")
    .eq("project_id", project_id)
    .in("status", activeStatuses)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (existingRunError) {
    throw new Error(`CALCULATION_RUN_CHECK_FAILED: ${existingRunError.message}`);
  }

  if (existingRun?.id) {
    return {
      state: "ALREADY_RUNNING",
      calculation_run_id: existingRun.id
    };
  }

  // 1. Maak calculation_run aan (startpunt voor UI + realtime updates)
  const { data: run, error: runError } = await supabase
    .from("calculation_runs")
    .insert({
      project_id,
      status: "queued",
      current_step: "project_scan",
      scenario_name: payload?.scenario_name || null,
      calculation_type: payload?.calculation_type || null,
      calculation_level: payload?.calculation_level || null,
      fixed_price: payload?.fixed_price || null,
      source_task_id: task_id
    })
    .select()
    .single();

  if (runError) {
    throw new Error(`CALCULATION_RUN_CREATE_FAILED: ${runError.message}`);
  }

  // 2. Zet vervolg-tasks klaar in de juiste volgorde
  const followUpTasks = [
    {
      project_id,
      calculation_run_id: run.id, // Propagate calculation_run_id
      action: "project_scan",
      status: "open",
      assigned_to: "executor",
      payload: {
        calculation_run_id: run.id
      }
    },
    {
      project_id,
      calculation_run_id: run.id, // Propagate calculation_run_id
      action: "generate_stabu",
      status: "open",
      assigned_to: "executor",
      payload: {
        calculation_run_id: run.id
      }
    },
    {
      project_id,
      calculation_run_id: run.id, // Propagate calculation_run_id
      action: "start_rekenwolk",
      status: "open",
      assigned_to: "executor",
      payload: {
        calculation_run_id: run.id
      }
    }
  ];

  const { error: taskError } = await supabase
    .from("executor_tasks")
    .insert(followUpTasks);

  if (taskError) {
    throw new Error(`FOLLOWUP_TASKS_CREATE_FAILED: ${taskError.message}`);
  }

  // 3. Klaar – executor kan door met pollen
  return {
    state: "STARTED",
    calculation_run_id: run.id
  };
}

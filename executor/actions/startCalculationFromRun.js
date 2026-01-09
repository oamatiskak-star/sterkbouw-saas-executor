// executor/actions/startCalculationFromRun.js
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

/**
 * startCalculationFromRun
 *
 * Verantwoordelijkheid:
 * - ENIGE startpunt vanuit UI
 * - maakt exact één calculation_run per project
 * - zet exact één keten aan executor_tasks klaar
 *
 * BELANGRIJK:
 * - idempotent
 * - GEEN rekenwerk
 * - GEEN PDF
 */
export async function startCalculationFromRun({ task_id, project_id, payload }) {
  if (!task_id) {
    throw new Error("START_CALCULATION_MISSING_TASK_ID");
  }

  if (!project_id) {
    throw new Error("START_CALCULATION_MISSING_PROJECT_ID");
  }

  /**
   * ====================================================
   * 1. GUARD — bestaat er al een actieve calculation_run?
   * ====================================================
   */
  const { data: existingRun, error: existingRunError } = await supabase
    .from("calculation_runs")
    .select("id, status")
    .eq("project_id", project_id)
    .in("status", ["queued", "running", "scanning", "calculating"])
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (existingRunError) {
    throw new Error(`CALCULATION_RUN_CHECK_FAILED: ${existingRunError.message}`);
  }

  if (existingRun?.id) {
    // Sluit de start_calculation taak netjes af
    await supabase
      .from("executor_tasks")
      .update({
        status: "completed",
        finished_at: new Date().toISOString()
      })
      .eq("id", task_id);

    return {
      state: "ALREADY_RUNNING",
      calculation_run_id: existingRun.id
    };
  }

  /**
   * =====================================
   * 2. Maak NIEUWE calculation_run aan
   * =====================================
   */
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

  /**
   * ==================================================
   * 3. Zet EXACT één set vervolg-tasks klaar
   * ==================================================
   */
  const followUpTasks = [
    {
      project_id,
      action: "project_scan",
      status: "open",
      assigned_to: "executor",
      payload: { calculation_run_id: run.id }
    },
    {
      project_id,
      action: "generate_stabu",
      status: "open",
      assigned_to: "executor",
      payload: { calculation_run_id: run.id }
    },
    {
      project_id,
      action: "start_rekenwolk",
      status: "open",
      assigned_to: "executor",
      payload: { calculation_run_id: run.id }
    }
  ];

  const { error: taskError } = await supabase
    .from("executor_tasks")
    .insert(followUpTasks);

  if (taskError) {
    throw new Error(`FOLLOWUP_TASKS_CREATE_FAILED: ${taskError.message}`);
  }

  /**
   * ==================================================
   * 4. Sluit start_calculation-task af (CRUCIAAL)
   * ==================================================
   */
  await supabase
    .from("executor_tasks")
    .update({
      status: "completed",
      finished_at: new Date().toISOString()
    })
    .eq("id", task_id);

  return {
    state: "STARTED",
    calculation_run_id: run.id
  };
}

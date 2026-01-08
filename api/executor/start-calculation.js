import { Router } from 'express';
import { createClient } from '@supabase/supabase-js';

const router = Router();

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

router.post('/', async (req, res) => {
  try {
    const {
      project_id,
      scenario_name,
      calculation_type,
      calculation_level,
      fixed_price
    } = req.body;

    if (!project_id) {
      return res.status(400).json({ error: 'project_id is required' });
    }

    /*
    =====================================================
    1. CREATE CALCULATION_RUN  (LEIDEND)
    =====================================================
    */
    const { data: run, error: runError } = await supabase
      .from('calculation_runs')
      .insert({
        project_id,
        scenario_name,
        calculation_type,
        calculation_level,
        fixed_price: fixed_price ?? null,
        status: 'queued',
        current_step: 'project_scan',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      })
      .select('id')
      .single();

    if (runError || !run) {
      console.error('START_CALCULATION: failed to create calculation_run', runError);
      return res.status(500).json({ error: 'Failed to create calculation_run' });
    }

    const calculation_run_id = run.id;

    /*
    =====================================================
    2. CREATE EXECUTOR TASKS (ALLE MET RUN-ID)
    =====================================================
    */
    const tasks = [
      {
        project_id,
        calculation_run_id,
        action: 'start_calculation',
        assigned_to: 'executor',
        status: 'open',
        payload: {
          project_id,
          calculation_run_id,
          scenario_name,
          calculation_type,
          calculation_level,
          fixed_price: fixed_price ?? null
        },
        created_at: new Date().toISOString()
      },
      {
        project_id,
        calculation_run_id,
        action: 'project_scan',
        assigned_to: 'executor',
        status: 'open',
        payload: {
          project_id,
          calculation_run_id
        },
        created_at: new Date().toISOString()
      },
      {
        project_id,
        calculation_run_id,
        action: 'generate_stabu',
        assigned_to: 'executor',
        status: 'open',
        payload: {
          project_id,
          calculation_run_id
        },
        created_at: new Date().toISOString()
      },
      {
        project_id,
        calculation_run_id,
        action: 'start_rekenwolk',
        assigned_to: 'executor',
        status: 'open',
        payload: {
          project_id,
          calculation_run_id
        },
        created_at: new Date().toISOString()
      }
    ];

    const { error: taskError } = await supabase
      .from('executor_tasks')
      .insert(tasks);

    if (taskError) {
      console.error('START_CALCULATION: failed to create executor tasks', taskError);

      // rollback calculation_run to failed
      await supabase
        .from('calculation_runs')
        .update({
          status: 'failed',
          updated_at: new Date().toISOString()
        })
        .eq('id', calculation_run_id);

      return res.status(500).json({ error: 'Failed to enqueue executor tasks' });
    }

    /*
    =====================================================
    3. RESPONSE
    =====================================================
    */
    return res.status(200).json({
      ok: true,
      calculation_run_id
    });

  } catch (err) {
    console.error('START_CALCULATION: unexpected error', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;

import { Router } from 'express'
import { createClient } from '@supabase/supabase-js'

const router = Router()

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
)

router.post('/', async (req, res) => {
  try {
    const {
      project_id,
      scenario_name,
      calculation_type,
      calculation_level,
      fixed_price
    } = req.body

    if (!project_id) {
      return res.status(400).json({ error: 'project_id is required' })
    }

    const now = new Date().toISOString()

    /*
    =====================================================
    1. HARD GUARD — BESTAANDE ACTIEVE CALCULATION_RUN
    =====================================================
    */
    const { data: existingRun, error: runSelectError } = await supabase
      .from('calculation_runs')
      .select('id, status')
      .eq('project_id', project_id)
      .in('status', ['queued', 'scanning', 'running'])
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()

    if (runSelectError) {
      return res.status(500).json({ error: runSelectError.message })
    }

    if (existingRun?.id) {
      return res.json({
        ok: true,
        calculation_run_id: existingRun.id,
        status: existingRun.status
      })
    }

    /*
    =====================================================
    2. CREATE LEIDENDE CALCULATION_RUN
    =====================================================
    */
    const { data: run, error: runInsertError } = await supabase
      .from('calculation_runs')
      .insert({
        project_id,
        scenario_name,
        calculation_type,
        calculation_level,
        fixed_price,
        status: 'queued',
        current_step: 'project_scan',
        created_at: now,
        updated_at: now
      })
      .select('id')
      .single()

    if (runInsertError) {
      return res.status(500).json({ error: runInsertError.message })
    }

    const calculation_run_id = run.id

    /*
    =====================================================
    3. HARD GUARD — BESTAANDE START_CALCULATION TASK
    =====================================================
    */
    const { data: existingTask, error: taskSelectError } = await supabase
      .from('executor_tasks')
      .select('id')
      .eq('calculation_run_id', calculation_run_id)
      .eq('action', 'start_calculation')
      .in('status', ['open', 'running'])
      .limit(1)
      .maybeSingle()

    if (taskSelectError) {
      return res.status(500).json({ error: taskSelectError.message })
    }

    if (existingTask?.id) {
      return res.json({
        ok: true,
        calculation_run_id,
        task_id: existingTask.id
      })
    }

    /*
    =====================================================
    4. CREATE EXECUTOR TASKS (GECONTROLEERDE KETEN)
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
          fixed_price
        },
        created_at: now
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
        created_at: now
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
        created_at: now
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
        created_at: now
      }
    ]

    const { error: taskInsertError } = await supabase
      .from('executor_tasks')
      .insert(tasks)

    if (taskInsertError) {
      return res.status(500).json({ error: taskInsertError.message })
    }

    /*
    =====================================================
    5. RESPONSE NAAR FRONTEND (STOP POLLING)
    =====================================================
    */
    return res.json({
      ok: true,
      calculation_run_id,
      status: 'queued'
    })

  } catch (err) {
    console.error('START_CALCULATION_FATAL', err)
    return res.status(500).json({ error: 'Internal server error' })
  }
})

export default router

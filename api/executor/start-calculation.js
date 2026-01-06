import { Router } from 'express';
import { createClient } from '@supabase/supabase-js';

const router = Router();

// Initialize Supabase client with service role key
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

router.post('/', async (req, res) => {
  try {
    const { project_id, scenario_name, calculation_type, calculation_level, fixed_price } = req.body;

    // Validate required fields
    if (!project_id) {
      console.error('START_CALCULATION_API: Missing project_id');
      return res.status(400).json({ error: 'project_id is required' });
    }

    // Insert into executor_tasks
    const { data, error } = await supabase
      .from('executor_tasks')
      .insert({
        project_id,
        action: 'start_calculation',
        assigned_to: 'executor',
        status: 'open',
        payload: {
          project_id,
          scenario_name,
          calculation_type,
          calculation_level,
          fixed_price,
        },
      })
      .select('id')
      .single();

    if (error) {
      console.error('START_CALCULATION_API: Supabase insert error', error);
      return res.status(500).json({ error: error.message });
    }

    res.json({ ok: true, task_id: data.id });
  } catch (err) {
    console.error('START_CALCULATION_API: Unexpected error', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;

import express from "express"
import { createClient } from "@supabase/supabase-js"

const router = express.Router()

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
)

router.post("/start-calculation", async (req, res) => {
  const {
    project_id,
    scenario_name,
    calculation_type,
    calculation_level,
    fixed_price
  } = req.body

  if (!project_id) {
    return res.status(400).json({ error: "project_id missing" })
  }

  try {
    /*
    =====================================
    1. CREATE CALCULATION RUN (LEIDEND)
    =====================================
    */
    const { data: run, error: runErr } = await supabase
      .from("calculation_runs")
      .insert({
        project_id,
        scenario_name,
        calculation_type,
        calculation_level,
        fixed_price,
        status: "queued",
        current_step: "project_scan",
        created_at: new Date().toISOString()
      })
      .select("id")
      .single()

    if (runErr) throw runErr

    const calculation_run_id = run.id

    /*
    =====================================
    2. CREATE EXECUTOR TASKS
    =====================================
    */
    const tasks = [
      {
        action: "start_calculation",
        project_id,
        calculation_run_id,
        status: "open",
        payload: {
          project_id,
          calculation_run_id
        }
      },
      {
        action: "project_scan",
        project_id,
        calculation_run_id,
        status: "open",
        payload: {
          project_id,
          calculation_run_id
        }
      },
      {
        action: "generate_stabu",
        project_id,
        calculation_run_id,
        status: "open",
        payload: {
          project_id,
          calculation_run_id
        }
      },
      {
        action: "start_rekenwolk",
        project_id,
        calculation_run_id,
        status: "open",
        payload: {
          project_id,
          calculation_run_id
        }
      }
    ]

    const { error: taskErr } = await supabase
      .from("executor_tasks")
      .insert(tasks)

    if (taskErr) throw taskErr

    /*
    =====================================
    3. RESPONSE
    =====================================
    */
    return res.status(200).json({
      calculation_run_id,
      status: "started"
    })

  } catch (err) {
    console.error("START_CALCULATION_ERROR", err)
    return res.status(500).json({ error: err.message })
  }
})

export default router

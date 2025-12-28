// executor/handlers/projectScan.js - DEBUG VERSIE
import { createClient } from "@supabase/supabase-js"
import { sendTelegram } from "../../integrations/telegramSender.js"

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  {
    auth: {
      persistSession: false,
      autoRefreshToken: false
    }
  }
)

console.log("[PROJECT_SCAN] Module loaded with URL:", process.env.SUPABASE_URL)

async function ensureCalculatie(project_id) {
  console.log("[PROJECT_SCAN] ensureCalculatie for:", project_id)
  // ... keep existing code ...
}

export async function handleProjectScan(task) {
  console.log("[PROJECT_SCAN] === START ===", {
    taskId: task?.id,
    projectId: task?.project_id,
    action: task?.action
  })
  
  if (!task?.id || !task.project_id) {
    console.error("[PROJECT_SCAN] Invalid task")
    return
  }

  const taskId = task.id
  const project_id = task.project_id
  const now = new Date().toISOString()

  try {
    // 1. TEST DATABASE CONNECTION FIRST
    console.log("[PROJECT_SCAN] Testing DB connection...")
    const { data: testData, error: testError } = await supabase
      .from("projects")
      .select("id")
      .eq("id", project_id)
      .limit(1)
      .single()
    
    if (testError) {
      console.error("[PROJECT_SCAN] DB Connection test FAILED:", testError)
      throw new Error(`Database connection failed: ${testError.message}`)
    }
    
    console.log("[PROJECT_SCAN] DB Connection OK")

    /* TASK → RUNNING */
    console.log("[PROJECT_SCAN] Updating task to running")
    await supabase
      .from("executor_tasks")
      .update({ status: "running", started_at: now })
      .eq("id", taskId)

    /* CALCULATIE GARANTEREN */
    await ensureCalculatie(project_id)

    /*
    =================================================
    TEST STABU POSTEN QUERY MET DETAILED LOGGING
    =================================================
    */
    console.log("[PROJECT_SCAN] Testing stabu_project_posten query...")
    
    // TEST 1: Simple count query
    const { count, error: countError } = await supabase
      .from("stabu_project_posten")
      .select("*", { count: 'exact', head: true })
      .eq("project_id", project_id)
    
    console.log("[PROJECT_SCAN] Count query result:", { count, error: countError?.message })
    
    // TEST 2: Try to insert one record
    const testRecord = {
      project_id,
      stabu_code: "TEST-001",
      omschrijving: "Test post voor debugging",
      eenheid: "stuk",
      normuren: 1.0,
      arbeidsprijs: 100.0,
      materiaalprijs: 50.0,
      hoeveelheid: 1,
      geselecteerd: true,
      created_at: now
    }
    
    console.log("[PROJECT_SCAN] Trying to insert test record...")
    const { data: insertedTest, error: insertTestError } = await supabase
      .from("stabu_project_posten")
      .insert(testRecord)
      .select()
      .single()
    
    if (insertTestError) {
      console.error("[PROJECT_SCAN] INSERT TEST FAILED:", {
        error: insertTestError,
        message: insertTestError.message,
        details: insertTestError.details,
        hint: insertTestError.hint,
        code: insertTestError.code
      })
      
      // Check if it's RLS or missing column
      if (insertTestError.code === '42501') {
        console.error("[PROJECT_SCAN] PERMISSION DENIED (RLS)")
      } else if (insertTestError.code === '42703') {
        console.error("[PROJECT_SCAN] UNDEFINED COLUMN - check table schema")
      }
    } else {
      console.log("[PROJECT_SCAN] INSERT TEST SUCCESS:", insertedTest)
      
      // Clean up test record
      await supabase
        .from("stabu_project_posten")
        .delete()
        .eq("id", insertedTest.id)
    }
    
    /*
    =================================================
    BYPASS: Ga direct naar generate_stabu
    =================================================
    */
    console.log("[PROJECT_SCAN] Bypassing stabu logic, going directly to generate_stabu")
    
    const { data: existing } = await supabase
      .from("executor_tasks")
      .select("id")
      .eq("project_id", project_id)
      .eq("action", "generate_stabu")
      .in("status", ["open", "running", "completed"])
      .maybeSingle()

    if (!existing) {
      console.log("[PROJECT_SCAN] Creating generate_stabu task")
      const { data: newTask, error: taskError } = await supabase
        .from("executor_tasks")
        .insert({
          project_id,
          action: "generate_stabu",
          status: "open",
          assigned_to: "executor",
          payload: { 
            project_id, 
            bypass_scan: true,
            created_at: now
          }
        })
        .select()
        .single()

      if (taskError) {
        console.error("[PROJECT_SCAN] Task creation failed:", taskError)
        throw new Error(`Failed to create generate_stabu task: ${taskError.message}`)
      }
      
      console.log("[PROJECT_SCAN] Created task:", newTask.id)
    } else {
      console.log("[PROJECT_SCAN] Task already exists:", existing.id)
    }

    /* TASK → COMPLETED */
    console.log("[PROJECT_SCAN] Marking task as completed")
    await supabase
      .from("executor_tasks")
      .update({
        status: "completed",
        finished_at: now,
        notes: "Bypassed stabu logic due to RLS/table issues"
      })
      .eq("id", taskId)

    console.log("[PROJECT_SCAN] === COMPLETED SUCCESSFULLY ===")

  } catch (err) {
    console.error("[PROJECT_SCAN] === CRITICAL ERROR ===", {
      message: err.message,
      stack: err.stack,
      taskId,
      project_id
    })
    
    await supabase
      .from("executor_tasks")
      .update({
        status: "failed",
        error: `Project scan error: ${err.message}`,
        finished_at: new Date().toISOString()
      })
      .eq("id", taskId)
      
    await supabase
      .from("executor_errors")
      .insert({
        task_id: taskId,
        project_id,
        action: "project_scan",
        error: err.message,
        stack: err.stack,
        debug_info: JSON.stringify({
          supabase_url: process.env.SUPABASE_URL,
          timestamp: new Date().toISOString()
        }),
        created_at: new Date().toISOString()
      })
  }
}

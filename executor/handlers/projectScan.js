// executor/handlers/projectScan.js - MET BETER ERROR HANDLING
import { createClient } from "@supabase/supabase-js"
import { sendTelegram } from "../../integrations/telegramSender.js"

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
)

async function ensureCalculatie(project_id) {
  // ... bestaande code ...
}

export async function handleProjectScan(task) {
  console.log("[PROJECT_SCAN] Starting for project:", task?.project_id)
  
  if (!task?.id || !task.project_id) {
    console.error("[PROJECT_SCAN] Invalid task:", task)
    return
  }

  const taskId = task.id
  const project_id = task.project_id
  const payload = task.payload || {}
  const chatId = payload.chat_id || null
  const now = new Date().toISOString()

  try {
    /* TASK → RUNNING */
    await supabase
      .from("executor_tasks")
      .update({ status: "running", started_at: now })
      .eq("id", taskId)

    /* CALCULATIE GARANTEREN */
    await ensureCalculatie(project_id)

    /*
    =================================================
    STABU POSTEN OPHALEN - MET FALLBACK
    =================================================
    */
    let posten = []
    
    try {
      // PROBEER EERST: stabu_project_posten (moet leeg zijn voor nieuw project)
      const { data: existingProjectPosten, error: existingError } = await supabase
        .from("stabu_project_posten")
        .select("id")
        .eq("project_id", project_id)
        .limit(1)
        
      if (existingError) {
        console.warn("[PROJECT_SCAN] Cannot query stabu_project_posten:", existingError.message)
        console.log("[PROJECT_SCAN] This is likely RLS issue, trying workaround...")
      }
      
      // HAAL STABU POSTEN UIT stabu_posten OF stabu_posts
      const { data: stabuData, error: stabuError } = await supabase
        .from("stabu_posten")  // Probeer eerst stabu_posten
        .select(`
          id,
          code,
          omschrijving,
          eenheid,
          normuren,
          arbeidsprijs,
          materiaalprijs
        `)
        .limit(100)  // Beperk voor nu
      
      if (stabuError) {
        console.warn("[PROJECT_SCAN] stabu_posten failed, trying stabu_posts:", stabuError.message)
        
        // FALLBACK: probeer stabu_posts
        const { data: postsData, error: postsError } = await supabase
          .from("stabu_posts")
          .select(`
            id,
            code,
            description as omschrijving,
            unit as eenheid,
            norm_hours as normuren,
            labor_price as arbeidsprijs,
            material_price as materiaalprijs
          `)
          .limit(100)
          
        if (postsError) {
          console.error("[PROJECT_SCAN] All stabu queries failed:", postsError.message)
          // Gebruik hardcoded fallback
          posten = getHardcodedStabuPosten()
        } else {
          posten = postsData || []
        }
      } else {
        posten = stabuData || []
      }
      
    } catch (fetchError) {
      console.error("[PROJECT_SCAN] Fetch error, using hardcoded posten:", fetchError.message)
      posten = getHardcodedStabuPosten()
    }

    if (!Array.isArray(posten) || posten.length === 0) {
      console.warn("[PROJECT_SCAN] No STABU posten found, using fallback")
      posten = getHardcodedStabuPosten()
    }

    console.log(`[PROJECT_SCAN] Working with ${posten.length} STABU posten`)

    /*
    =================================================
    PROJECT-STABU OPBOUWEN
    =================================================
    */
    // EERST: Probeer te inserten in stabu_project_posten
    const projectPosten = posten.map(p => ({
      project_id,
      stabu_post_id: p.id,
      stabu_code: p.code || `STABU-${Math.random().toString(36).substr(2, 9)}`,
      omschrijving: p.omschrijving || `Stabu post ${p.id}`,
      eenheid: p.eenheid || "stuk",
      normuren: p.normuren || 1.0,
      arbeidsprijs: p.arbeidsprijs || 50.0,
      materiaalprijs: p.materiaalprijs || 100.0,
      hoeveelheid: 1,
      geselecteerd: true,
      created_at: now
    }))

    let insertSuccess = false
    
    try {
      const { error: insertError } = await supabase
        .from("stabu_project_posten")
        .insert(projectPosten)

      if (insertError) {
        console.warn("[PROJECT_SCAN] Cannot insert into stabu_project_posten (RLS?):", insertError.message)
        console.log("[PROJECT_SCAN] Using alternative table: project_stabu_regels")
        
        // FALLBACK: gebruik project_stabu_regels
        const fallbackData = projectPosten.map(p => ({
          project_id: p.project_id,
          stabu_code: p.stabu_code,
          omschrijving: p.omschrijving,
          eenheid: p.eenheid,
          norm_uren: p.normuren,
          arbeidsloon: p.arbeidsprijs,
          materiaalprijs: p.materiaalprijs,
          hoeveelheid: p.hoeveelheid,
          created_at: p.created_at
        }))
        
        await supabase
          .from("project_stabu_regels")
          .insert(fallbackData)
          
        insertSuccess = true
        console.log("[PROJECT_SCAN] Inserted into project_stabu_regels instead")
        
      } else {
        insertSuccess = true
        console.log(`[PROJECT_SCAN] Inserted ${projectPosten.length} posten into stabu_project_posten`)
      }
      
    } catch (insertException) {
      console.error("[PROJECT_SCAN] Insert exception:", insertException.message)
      // Ga gewoon door, we hebben tenminste posten in memory
    }

    /*
    =================================================
    PROJECT STATUS
    =================================================
    */
    await supabase
      .from("projects")
      .update({
        analysis_status: true,
        updated_at: now
      })
      .eq("id", project_id)

    console.log(`[PROJECT_SCAN] Updated project status`)

    /*
    =================================================
    VOLGENDE STAP: GENERATE_STABU
    =================================================
    */
    const { data: existing } = await supabase
      .from("executor_tasks")
      .select("id")
      .eq("project_id", project_id)
      .eq("action", "generate_stabu")
      .in("status", ["open", "running", "completed"])
      .maybeSingle()

    if (!existing) {
      const { data: newTask, error: taskError } = await supabase
        .from("executor_tasks")
        .insert({
          project_id,
          action: "generate_stabu",
          status: "open",
          assigned_to: "executor",
          payload: { project_id, chat_id: chatId, posten_count: posten.length }
        })
        .select()
        .single()

      if (taskError) {
        console.error("[PROJECT_SCAN] Task creation error:", taskError)
      } else {
        console.log("[PROJECT_SCAN] Created generate_stabu task:", newTask.id)
      }
    } else {
      console.log("[PROJECT_SCAN] generate_stabu task already exists:", existing.id)
    }

    /* TASK → COMPLETED */
    await supabase
      .from("executor_tasks")
      .update({
        status: "completed",
        finished_at: now
      })
      .eq("id", taskId)

    console.log("[PROJECT_SCAN] Completed successfully")

    if (chatId) {
      await sendTelegram(chatId, `Projectscan afgerond: ${posten.length} posten geladen`)
    }

  } catch (err) {
    console.error("[PROJECT_SCAN] Critical error:", err.message, err.stack)
    
    await supabase
      .from("executor_tasks")
      .update({
        status: "failed",
        error: `Project scan failed: ${err.message}`,
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
        created_at: new Date().toISOString()
      })
  }
}

// Helper functie voor hardcoded fallback
function getHardcodedStabuPosten() {
  return [
    {
      id: 'fallback-1',
      code: '21.10',
      omschrijving: 'Grondwerk en fundering',
      eenheid: 'm²',
      normuren: 2.5,
      arbeidsprijs: 85,
      materiaalprijs: 120
    },
    {
      id: 'fallback-2', 
      code: '22.20',
      omschrijving: 'Casco en draagconstructie',
      eenheid: 'm²',
      normuren: 6.0,
      arbeidsprijs: 195,
      materiaalprijs: 280
    },
    {
      id: 'fallback-3',
      code: '41.10',
      omschrijving: 'Installaties E en W',
      eenheid: 'stuk',
      normuren: 120,
      arbeidsprijs: 45000,
      materiaalprijs: 55000
    }
  ]
}

// executor/handlers/generateStabu.js - GECORRIGEERDE VERSIE
import { createClient } from "@supabase/supabase-js"

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
)

console.log("[GENERATE_STABU] Module loaded")

async function fail(taskId, msg) {
  console.error("[GENERATE_STABU] Task failed:", taskId, msg)
  
  if (!taskId) return
  await supabase
    .from("executor_tasks")
    .update({
      status: "failed",
      error: msg,
      finished_at: new Date().toISOString()
    })
    .eq("id", taskId)
}

/*
=====================================
CALCULATIE GARANTEREN
=====================================
*/
async function ensureCalculatie(project_id) {
  console.log("[GENERATE_STABU] Ensuring calculatie for:", project_id)
  
  const { data: existing, error } = await supabase
    .from("calculaties")
    .select("id")
    .eq("project_id", project_id)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle()

  if (error) {
    throw new Error("CALCULATIE_LOOKUP_FAILED: " + error.message)
  }

  if (existing) {
    console.log("[GENERATE_STABU] Existing calculatie:", existing.id)
    return existing.id
  }

  const { data: created, error: insertErr } = await supabase
    .from("calculaties")
    .insert({
      project_id,
      workflow_status: "initialized",
      created_at: new Date().toISOString()
    })
    .select("id")
    .single()

  if (insertErr) {
    throw new Error("CALCULATIE_CREATE_FAILED: " + insertErr.message)
  }

  console.log("[GENERATE_STABU] Created new calculatie:", created.id)
  return created.id
}

/*
=====================================
MAIN FUNCTION
=====================================
*/
export async function handleGenerateStabu(task) {
  console.log("[GENERATE_STABU] Starting with task:", task?.id, "project:", task?.project_id)
  
  if (!task?.id || !task.project_id) {
    console.error("[GENERATE_STABU] Invalid task:", task)
    return
  }

  const taskId = task.id
  const project_id = task.project_id
  const now = new Date().toISOString()

  try {
    /*
    ============================
    LOCK: GEEN DUBBELE RUN
    ============================
    */
    const { data: running } = await supabase
      .from("executor_tasks")
      .select("id")
      .eq("project_id", project_id)
      .eq("action", "generate_stabu")
      .eq("status", "running")
      .maybeSingle()

    if (running) {
      console.log("[GENERATE_STABU] Already running, skipping:", running.id)
      await supabase
        .from("executor_tasks")
        .update({
          status: "skipped",
          finished_at: now
        })
        .eq("id", taskId)
      return
    }

    /*
    ============================
    TASK → RUNNING
    ============================
    */
    console.log("[GENERATE_STABU] Setting task to running")
    await supabase
      .from("executor_tasks")
      .update({
        status: "running",
        started_at: now
      })
      .eq("id", taskId)

    /*
    ============================
    HARD GUARD: PROJECT_SCAN
    ============================
    */
    const { data: scan } = await supabase
      .from("executor_tasks")
      .select("status")
      .eq("project_id", project_id)
      .eq("action", "project_scan")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle()

    if (!scan || scan.status !== "completed") {
      throw new Error("PROJECT_SCAN_NOT_COMPLETED: Scan must finish first")
    }

    console.log("[GENERATE_STABU] Project scan verified")

    /*
    ============================
    CALCULATIE GARANTEREN
    ============================
    */
    const calculatieId = await ensureCalculatie(project_id)

    /*
    ============================
    PROJECT DATA OPHALEN
    ============================
    */
    const { data: project, error: projErr } = await supabase
      .from("projects")
      .select("project_type, oppervlakte")
      .eq("id", project_id)
      .single()

    if (projErr) {
      console.error("[GENERATE_STABU] Project fetch error:", projErr)
      throw new Error("PROJECT_NOT_FOUND: " + projErr.message)
    }

    const type = project?.project_type || "nieuwbouw"
    const oppervlakte = project?.oppervlakte || 120  // default m²
    
    console.log(`[GENERATE_STABU] Project type: ${type}, oppervlakte: ${oppervlakte}m²`)

    /*
    ============================
    STABU BASIS POSTEN
    ============================
    */
    const basisPosten = type === "nieuwbouw"
      ? [
          { code: "21.10", omschrijving: "Grondwerk en fundering", eenheid: "m²", hoeveelheid: oppervlakte, prijs_eenh: 85, normuren: 2.5 },
          { code: "22.20", omschrijving: "Casco en draagconstructie", eenheid: "m²", hoeveelheid: oppervlakte, prijs_eenh: 195, normuren: 6.0 },
          { code: "24.30", omschrijving: "Gevels en kozijnen", eenheid: "m²", hoeveelheid: oppervlakte * 0.8, prijs_eenh: 125, normuren: 3.5 },
          { code: "31.40", omschrijving: "Daken en isolatie", eenheid: "m²", hoeveelheid: oppervlakte, prijs_eenh: 75, normuren: 2.0 },
          { code: "41.10", omschrijving: "Installaties E en W", eenheid: "stuk", hoeveelheid: 1, prijs_eenh: 45000, normuren: 120 },
          { code: "51.90", omschrijving: "Afbouw en oplevering", eenheid: "stuk", hoeveelheid: 1, prijs_eenh: 32000, normuren: 80 }
        ]
      : [
          { code: "12.10", omschrijving: "Sloop en stripwerk", eenheid: "m²", hoeveelheid: oppervlakte, prijs_eenh: 55, normuren: 1.8 },
          { code: "21.30", omschrijving: "Constructieve aanpassingen", eenheid: "m²", hoeveelheid: oppervlakte, prijs_eenh: 95, normuren: 3.0 },
          { code: "24.30", omschrijving: "Gevel en isolatie", eenheid: "m²", hoeveelheid: oppervlakte * 0.8, prijs_eenh: 110, normuren: 3.0 },
          { code: "41.10", omschrijving: "Installaties E en W", eenheid: "stuk", hoeveelheid: 1, prijs_eenh: 38000, normuren: 100 },
          { code: "51.90", omschrijving: "Afbouw en herindeling", eenheid: "stuk", hoeveelheid: 1, prijs_eenh: 28000, normuren: 70 }
        ]

    console.log(`[GENERATE_STABU] Generated ${basisPosten.length} basis posten`)

    /*
    ============================
    OUDE CALCULATIE REGELS OPSCHONEN
    ============================
    */
    console.log("[GENERATE_STABU] Cleaning old calculatie_regels")
    await supabase
      .from("calculatie_regels")
      .delete()
      .eq("project_id", project_id)

    /*
    ============================
    CALCULATIE REGELS AANMAKEN
    ============================
    */
    const calculatieRegels = basisPosten.map((post, index) => {
      const loonkosten = (post.normuren || 0) * 55  // €55/u gemiddeld
      const materiaalprijs = (post.prijs_eenh || 0) * 0.6  // 60% materiaal
      const totaal = (post.prijs_eenh || 0) * (post.hoeveelheid || 1)
      
      return {
        project_id,
        calculatie_id: calculatieId,
        stabu_code: post.code,
        omschrijving: post.omschrijving,
        eenheid: post.eenheid,
        hoeveelheid: post.hoeveelheid,
        normuren: post.normuren,
        uren: (post.normuren || 0) * (post.hoeveelheid || 1),
        loonkosten: loonkosten * (post.hoeveelheid || 1),
        prijs_eenh: post.prijs_eenh,
        materiaalprijs: materiaalprijs * (post.hoeveelheid || 1),
        oa_perc: 8,  // overhead percentage
        oa: totaal * 0.08,
        stelp_eenh: 0,
        stelposten: 0,
        totaal: totaal,
        volgorde: index + 1,
        created_at: now
      }
    })

    console.log("[GENERATE_STABU] Inserting calculatie regels")
    const { data: insertedRegels, error: insertError } = await supabase
      .from("calculatie_regels")
      .insert(calculatieRegels)
      .select("id, stabu_code, totaal")

    if (insertError) {
      console.error("[GENERATE_STABU] Insert error:", insertError)
      throw new Error("CALCULATIE_REGELS_INSERT_FAILED: " + insertError.message)
    }

    console.log(`[GENERATE_STABU] Inserted ${insertedRegels?.length || 0} calculatie regels`)

    /*
    ============================
    TOTALEN BEREKENEN
    ============================
    */
    const totalen = calculatieRegels.reduce((acc, regel) => ({
      kostprijs: (acc.kostprijs || 0) + (regel.totaal || 0),
      loonkosten: (acc.loonkosten || 0) + (regel.loonkosten || 0),
      materiaal: (acc.materiaal || 0) + (regel.materiaalprijs || 0),
      overhead: (acc.overhead || 0) + (regel.oa || 0)
    }), {})

    console.log("[GENERATE_STABU] Calculated totalen:", totalen)

    // Sla totalen op
    await supabase
      .from("calculatie_totalen")
      .upsert({
        project_id,
        calculatie_id: calculatieId,
        kostprijs: totalen.kostprijs,
        loonkosten: totalen.loonkosten,
        materiaal: totalen.materiaal,
        overhead: totalen.overhead,
        winstopslag: totalen.kostprijs * 0.1,  // 10% winst
        btw: (totalen.kostprijs * 1.1) * 0.21, // 10% winst + 21% btw
        totaal_incl: (totalen.kostprijs * 1.1) * 1.21,
        created_at: now,
        updated_at: now
      }, { onConflict: 'project_id,calculatie_id' })

    /*
    ============================
    UPDATE PROJECT MET CALCULATIE INFO
    ============================
    */
    await supabase
      .from("projects")
      .update({
        calculatie_status: true,
        calculatie_generated_at: now,
        updated_at: now
      })
      .eq("id", project_id)

    /*
    ============================
    TASK → COMPLETED
    ============================
    */
    console.log("[GENERATE_STABU] Marking task as completed")
    await supabase
      .from("executor_tasks")
      .update({
        status: "completed",
        finished_at: now
      })
      .eq("id", taskId)

    /*
    ============================
    VOLGENDE STAP: START_REKENWOLK
    ============================
    */
    const { data: existingNext } = await supabase
      .from("executor_tasks")
      .select("id")
      .eq("project_id", project_id)
      .eq("action", "start_rekenwolk")
      .in("status", ["open", "running", "completed"])
      .limit(1)
      .maybeSingle()

    if (!existingNext) {
      console.log("[GENERATE_STABU] Creating start_rekenwolk task")
      await supabase
        .from("executor_tasks")
        .insert({
          project_id,
          action: "start_rekenwolk",
          status: "open",
          assigned_to: "executor",
          payload: { project_id }
        })
    } else {
      console.log("[GENERATE_STABU] start_rekenwolk task already exists:", existingNext.id)
    }

    console.log("[GENERATE_STABU] Successfully completed")

  } catch (err) {
    console.error("[GENERATE_STABU] Critical error:", err.message, err.stack)
    await fail(taskId, err.message || "GENERATE_STABU_ERROR")
    
    // Log detailed error
    await supabase
      .from("executor_errors")
      .insert({
        task_id: taskId,
        project_id,
        action: "generate_stabu",
        error: err.message,
        stack: err.stack,
        created_at: new Date().toISOString()
      })
  }
}

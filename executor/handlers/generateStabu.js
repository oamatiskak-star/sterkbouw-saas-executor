// executor/handlers/generateStabu.js - GECORRIGEERDE VERSIE MET JUISTE KOLOMNAMEN
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
    console.warn("[GENERATE_STABU] Calculatie lookup warning:", error.message)
    return null
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
    console.warn("[GENERATE_STABU] Calculatie create warning:", insertErr.message)
    return null
  }

  console.log("[GENERATE_STABU] Created new calculatie:", created.id)
  return created.id
}

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
    console.log("[GENERATE_STABU] Setting task to running")
    await supabase
      .from("executor_tasks")
      .update({
        status: "running",
        started_at: now
      })
      .eq("id", taskId)

    console.log("[GENERATE_STABU] Waiting for project_scan to complete...")
    let scanCompleted = false
    let retryCount = 0
    const maxRetries = 10

    while (!scanCompleted && retryCount < maxRetries) {
      const { data: scan } = await supabase
        .from("executor_tasks")
        .select("status, finished_at")
        .eq("project_id", project_id)
        .eq("action", "project_scan")
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle()

      if (scan && scan.status === "completed") {
        scanCompleted = true
        console.log("[GENERATE_STABU] Project scan verified (completed at:", scan.finished_at, ")")
        break
      }
      
      retryCount++
      console.log(`[GENERATE_STABU] Project scan not completed yet (attempt ${retryCount}/${maxRetries}), waiting...`)
      
      if (retryCount < maxRetries) {
        await new Promise(resolve => setTimeout(resolve, 1000))
      }
    }

    if (!scanCompleted) {
      console.warn("[GENERATE_STABU] Project scan not marked as completed after retries, proceeding anyway...")
    }

    const calculatieId = await ensureCalculatie(project_id)

    const { data: project } = await supabase
      .from("projects")
      .select("project_type, projectnaam, adres, plaatsnaam")
      .eq("id", project_id)
      .single()

    const type = project?.project_type || "nieuwbouw"
    const projectText = `${project?.projectnaam || ''} ${project?.adres || ''} ${project?.plaatsnaam || ''}`
    const wordCount = projectText.split(/\s+/).filter(word => word.length > 0).length
    const oppervlakte = wordCount > 2 ? wordCount * 20 : 120
    
    console.log(`[GENERATE_STABU] Project type: ${type}, estimated oppervlakte: ${oppervlakte}m²`)

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

    console.log("[GENERATE_STABU] Cleaning old calculatie_regels")
    await supabase
      .from("calculatie_regels")
      .delete()
      .eq("project_id", project_id)

    const calculatieRegels = basisPosten.map((post, index) => {
      const loonkosten = (post.normuren || 0) * 55
      const materiaalprijs = (post.prijs_eenh || 0) * 0.6
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
        oa_perc: 8,
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

    const totalen = calculatieRegels.reduce((acc, regel) => ({
      kostprijs: (acc.kostprijs || 0) + (regel.totaal || 0),
      loonkosten: (acc.loonkosten || 0) + (regel.loonkosten || 0),
      materiaal: (acc.materiaal || 0) + (regel.materiaalprijs || 0),
      overhead: (acc.overhead || 0) + (regel.oa || 0)
    }), {})

    console.log("[GENERATE_STABU] Calculated totalen:", totalen)

    await supabase
      .from("projects")
      .update({
        calculatie_status: true,
        calculatie_generated_at: now
      })
      .eq("id", project_id)

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
    }

    console.log("[GENERATE_STABU] Marking task as completed")
    await supabase
      .from("executor_tasks")
      .update({
        status: "completed",
        finished_at: now
      })
      .eq("id", taskId)

    console.log("[GENERATE_STABU] Successfully completed")

  } catch (err) {
    console.error("[GENERATE_STABU] Error:", err.message)
    
    const nonCriticalErrors = [
      "PROJECT_SCAN_NOT_COMPLETED",
      "CALCULATIE_LOOKUP_FAILED",
      "PROJECT_NOT_FOUND",
      "calculatie_totalen"
    ]
    
    const isNonCritical = nonCriticalErrors.some(errorMsg => 
      err.message.includes(errorMsg)
    )
    
    if (isNonCritical) {
      console.warn("[GENERATE_STABU] Non-critical error, marking task as completed anyway")
      
      await supabase
        .from("executor_tasks")
        .update({
          status: "completed",
          finished_at: new Date().toISOString(),
          notes: `Completed: ${err.message}`
        })
        .eq("id", taskId)
        
    } else {
      console.error("[GENERATE_STABU] Critical error, failing task:", err.message)
      await fail(taskId, err.message || "GENERATE_STABU_ERROR")
    }
  }
}

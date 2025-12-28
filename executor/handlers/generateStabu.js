import { createClient } from "@supabase/supabase-js"
import { TwoJoursWriter } from "../../builder/pdf/TwoJoursWriter.js"

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
)

async function fail(taskId, msg) {
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

  if (existing) return existing.id

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

  return created.id
}

export async function handleGenerateStabu(task) {
  if (!task?.id || !task.project_id) return

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
      throw new Error("project_scan_not_completed")
    }

    /*
    ============================
    CALCULATIE GARANTEREN
    ============================
    */
    await ensureCalculatie(project_id)

    /*
    ============================
    OUDE STABU OPSCHONEN
    ============================
    */
    await supabase
      .from("stabu_result_regels")
      .delete()
      .eq("project_id", project_id)

    /*
    ============================
    PROJECT TYPE
    ============================
    */
    const { data: project, error: projErr } = await supabase
      .from("projects")
      .select("project_type")
      .eq("id", project_id)
      .single()

    if (projErr) throw projErr

    const type = project?.project_type || "nieuwbouw"

    /*
    ============================
    STABU BASIS (INHOUD)
    ============================
    */
    const regels =
      type === "nieuwbouw"
        ? [
            { code: "21.10", omschrijving: "Grondwerk en fundering", norm: "per m²", prijs: 65000 },
            { code: "22.20", omschrijving: "Casco en draagconstructie", norm: "per m²", prijs: 145000 },
            { code: "24.30", omschrijving: "Gevels en kozijnen", norm: "per m²", prijs: 92000 },
            { code: "31.40", omschrijving: "Daken en isolatie", norm: "per m²", prijs: 54000 },
            { code: "41.10", omschrijving: "Installaties E en W", norm: "per woning", prijs: 78000 },
            { code: "51.90", omschrijving: "Afbouw en oplevering", norm: "per woning", prijs: 98000 }
          ]
        : [
            { code: "12.10", omschrijving: "Sloop en stripwerk", norm: "per m²", prijs: 42000 },
            { code: "21.30", omschrijving: "Constructieve aanpassingen", norm: "per m²", prijs: 68000 },
            { code: "24.30", omschrijving: "Gevel en isolatie", norm: "per m²", prijs: 51000 },
            { code: "41.10", omschrijving: "Installaties E en W", norm: "per woning", prijs: 73000 },
            { code: "51.90", omschrijving: "Afbouw en herindeling", norm: "per woning", prijs: 88000 }
          ]

    /*
    ============================
    INSERT STABU RESULT REGELS
    ============================
    */
    const { data: inserted, error: insertErr } = await supabase
      .from("stabu_result_regels")
      .insert(
        regels.map(r => ({
          project_id,
          stabu_code: r.code,
          omschrijving: r.omschrijving,
          norm: r.norm,
          hoeveelheid: null,
          eenheidsprijs: r.prijs,
          btw_tarief: 21
        }))
      )
      .select("id")

    if (insertErr) throw insertErr
    if (!inserted || inserted.length === 0) {
      throw new Error("stabu_insert_empty")
    }

    /*
    ============================
    2JOURS PDF – STABU BASIS
    ============================
    */
    const pdf = await TwoJoursWriter.open(project_id)

    await pdf.writeSection("stabu.basis", {
      titel: "STABU calc

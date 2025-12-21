import { createClient } from "@supabase/supabase-js"

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
)

export default async function startRekenwolk(payload = {}) {
  const { project_id } = payload

  if (!project_id) {
    throw new Error("START_REKENWOLK_MISSING_PROJECT_ID")
  }

  const now = new Date().toISOString()

  // 1. START LOG
  await supabase.from("project_initialization_log").insert({
    project_id,
    module: "REKENWOLK",
    status: "running",
    started_at: now
  })

  // 2. EXECUTIE (simulatie / placeholder)
  const { error } = await supabase
    .from("rekenwolk_results")
    .insert({
      project_id,
      status: "started",
      created_at: now
    })

  if (error) {
    await supabase.from("project_initialization_log").insert({
      project_id,
      module: "REKENWOLK",
      status: "error",
      finished_at: new Date().toISOString(),
      output_ref: error.message
    })

    throw new Error("START_REKENWOLK_INSERT_FAILED: " + error.message)
  }

  // 3. DONE LOG
  await supabase.from("project_initialization_log").insert({
    project_id,
    module: "REKENWOLK",
    status: "done",
    finished_at: new Date().toISOString()
  })

  // 4. CALCULATIE UIT INITIALISATIE HALEN
  await supabase
    .from("calculaties")
    .update({
      workflow_status: "concept"
    })
    .eq("project_id", project_id)

  return {
    state: "DONE",
    project_id
  }
}

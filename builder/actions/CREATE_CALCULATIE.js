import { createClient } from "@supabase/supabase-js"

export default async function CREATE_CALCULATIE(payload = {}) {
  const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  )

  const project_id = payload.project_id

  if (!project_id) {
    return {
      status: "failed",
      error: "CREATE_CALCULATIE_NO_PROJECT_ID"
    }
  }

  // Check of er al een calculatie bestaat voor dit project (laatste)
  const { data: existing } = await supabase
    .from("calculaties")
    .select("id")
    .eq("project_id", project_id)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle()

  if (existing) {
    return {
      status: "completed",
      calculatie_id: existing.id,
      reused: true
    }
  }

  // Maak nieuwe calculatie aan
  const { data, error } = await supabase
    .from("calculaties")
    .insert({
      project_id,
      workflow_status: "initialized"
    })
    .select()
    .single()

  if (error || !data) {
    return {
      status: "failed",
      error: error?.message || "CREATE_CALCULATIE_FAILED"
    }
  }

  return {
    status: "completed",
    calculatie_id: data.id,
    reused: false
  }
}

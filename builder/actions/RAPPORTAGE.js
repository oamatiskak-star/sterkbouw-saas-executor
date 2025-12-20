export default async function RAPPORTAGE({ project_id, supabase }) {
  await supabase.from("rapportage_results").insert({
    project_id,
    status: "ready",
    created_at: new Date().toISOString()
  })
}
js
Code kopiëren

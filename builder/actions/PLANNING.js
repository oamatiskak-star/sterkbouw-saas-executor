export default async function PLANNING({ project_id, supabase }) {
  await supabase.from("planning_results").insert({
    project_id,
    status: "planned",
    created_at: new Date().toISOString()
  })
}

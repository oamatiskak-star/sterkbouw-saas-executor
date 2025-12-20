export default async function INSTALLATIES_W({ project_id, supabase }) {
  await supabase.from("installaties_w_results").insert({
    project_id,
    status: "ok",
    created_at: new Date().toISOString()
  })
}

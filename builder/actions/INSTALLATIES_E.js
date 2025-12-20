export default async function INSTALLATIES_E({ project_id, supabase }) {
  await supabase.from("installaties_e_results").insert({
    project_id,
    status: "ok",
    created_at: new Date().toISOString()
  })
}

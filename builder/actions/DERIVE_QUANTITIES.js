export default async function DERIVE_QUANTITIES({ project_id, supabase }) {
  await supabase.from("quantity_results").insert({
    project_id,
    status: "derived",
    created_at: new Date().toISOString()
  })
}

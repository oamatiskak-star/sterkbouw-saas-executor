// builder/actions/GENERATE_STABU.js
export default async function GENERATE_STABU({ project_id, supabase }) {
  await supabase.from("stabu_results").insert({
    project_id,
    status: "generated",
    created_at: new Date().toISOString()
  })
}

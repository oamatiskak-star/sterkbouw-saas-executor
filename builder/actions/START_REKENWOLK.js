export default async function START_REKENWOLK({ project_id, supabase }) {
  await supabase.from("rekenwolk_results").insert({
    project_id,
    status: "started"
  })
}

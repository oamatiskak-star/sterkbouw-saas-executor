export default async function PROJECT_SCAN({ project_id, supabase }) {
  await supabase.from("project_scan_results").insert({
    project_id,
    result: "scan_ok"
  })
}

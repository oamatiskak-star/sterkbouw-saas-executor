import { createClient } from "@supabase/supabase-js"

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
)

export async function generatePdfUrl(project_id) {
  if (!project_id) return null

  const pdfPath = `${project_id}/calculatie_2jours.pdf`

  const { data, error } = await supabase.storage
    .from("sterkcalc")
    .createSignedUrl(pdfPath, 3600)

  if (error || !data?.signedUrl) {
    throw new Error("SIGNED_URL_FAILED")
  }

  await supabase
    .from("projects")
    .update({ pdf_url: data.signedUrl })
    .eq("id", project_id)

  return data.signedUrl
}

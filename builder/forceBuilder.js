import { createClient } from "@supabase/supabase-js"

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
)

/*
========================
FORCE BUILDER MODE
– Geen SKIP
– Altijd CREATE of UPDATE
– Frontend + Backend + Data
========================
*/

export async function runForceBuilder(task) {
  const { type, project_id } = task

  if (!project_id) {
    throw new Error("PROJECT_ID_ONTBREEKT")
  }

  console.log("FORCE BUILDER START:", type, "PROJECT:", project_id)

  // 1. Zorg dat module bestaat in modules-tabel
  await supabase.from("modules").upsert({
    project_id,
    type,
    status: "active",
    updated_at: new Date().toISOString()
  })

  // 2. Zorg dat basis data record bestaat
  await supabase.from("module_data").upsert({
    project_id,
    module: type,
    data: {},
    updated_at: new Date().toISOString()
  })

  // 3. Registreer frontend pagina
  await supabase.from("ui_pages").upsert({
    project_id,
    route: "/" + type.replace(":", "/"),
    module: type,
    layout: "default",
    status: "active",
    updated_at: new Date().toISOString()
  })

  // 4. Registreer dashboard widget
  await supabase.from("dashboard_widgets").upsert({
    project_id,
    module: type,
    widget_type: "status",
    position: "auto",
    updated_at: new Date().toISOString()
  })

  // 5. Resultaat loggen
  await supabase.from("builder_results").insert({
    project_id,
    action: type,
    status: "FORCE_BUILT",
    created_at: new Date().toISOString()
  })

  console.log("FORCE BUILDER DONE:", type)
}

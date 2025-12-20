import supabase from "../../supabaseClient.js"

export async function handleDeriveQuantities(task) {
  const { project_id } = task.payload

  await supabase.from("project_initialization_log").insert({
    project_id,
    module: "HOEVEELHEDEN",
    status: "running"
  })

  const { data: stabu } = await supabase
    .from("calculatie_stabu")
    .select("*")
    .eq("project_id", project_id)

  const regels = stabu.map(item => ({
    calculatie_id: project_id,
    stabu_code: item.stabu_code,
    omschrijving: item.omschrijving,
    hoeveelheid: 1,
    eenheid: "st",
    materiaalprijs: 100,
    arbeidsprijs: 75,
    totaal: 175
  }))

  await supabase.from("calculatie_regels").insert(regels)

  await supabase
    .from("project_initialization_log")
    .update({ status: "done", finished_at: new Date().toISOString() })
    .eq("project_id", project_id)
    .eq("module", "HOEVEELHEDEN")

  await supabase
    .from("calculaties")
    .update({
      status: "initialized",
      workflow_status: "concept"
    })
    .eq("id", project_id)

  await supabase
    .from("executor_tasks")
    .update({ status: "done" })
    .eq("id", task.id)
}

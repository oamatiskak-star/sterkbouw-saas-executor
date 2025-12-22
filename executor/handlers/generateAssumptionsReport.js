import supabase from "../../supabaseClient.js"

function assert(cond, msg) {
  if (!cond) throw new Error(msg)
}

export async function handleGenerateAssumptionsReport(task) {
  assert(task && (task.project_id || task.payload?.project_id), "ASSUME_NO_PROJECT_ID")
  const project_id = task.project_id || task.payload.project_id

  /*
  ============================
  START LOG
  ============================
  */
  await supabase.from("project_initialization_log").insert({
    project_id,
    module: "AANNAMES",
    status: "running",
    started_at: new Date().toISOString()
  })

  /*
  ============================
  ACTIEVE CALCULATIE
  ============================
  */
  const { data: calculatie, error: calcErr } = await supabase
    .from("calculaties")
    .select("id, kostprijs, verkoopprijs, marge")
    .eq("project_id", project_id)
    .order("created_at", { ascending: false })
    .limit(1)
    .single()

  assert(!calcErr && calculatie, "ASSUME_NO_CALCULATIE")
  const calculatie_id = calculatie.id

  /*
  ============================
  INPUT DATA CONTROLE
  ============================
  */
  const { data: regels, error: regelsErr } = await supabase
    .from("calculatie_regels")
    .select("id, stabu_code, eenheid, hoeveelheid")
    .eq("calculatie_id", calculatie_id)

  assert(!regelsErr, "ASSUME_REGELS_FETCH_FAILED")
  assert(regels && regels.length > 0, "ASSUME_NO_REGELS")

  /*
  ============================
  AANNAMES OPBOUW
  ============================
  */
  const aannames = [
    {
      code: "HOEVEELHEDEN",
      omschrijving: "Hoeveelheden zijn gebaseerd op STABU-indeling en globale uitgangspunten.",
      bron: "STABU + projectscan"
    },
    {
      code: "PRIJZEN",
      omschrijving: "Materiaal- en arbeidsprijzen zijn marktconform en exclusief extreme fluctuaties.",
      bron: "Historische data"
    },
    {
      code: "UITVOERING",
      omschrijving: "Uitvoering onder normale omstandigheden zonder versnelde planning.",
      bron: "Planningmodule"
    },
    {
      code: "RISICO",
      omschrijving: "Risicoreservering is gebaseerd op bouwsom en complexiteit.",
      bron: "Risicomodule"
    }
  ]

  /*
  ============================
  OUDE AANNAMES OPSCHONEN
  ============================
  */
  await supabase
    .from("project_aannames")
    .delete()
    .eq("project_id", project_id)

  /*
  ============================
  AANNAMES OPSLAAN
  ============================
  */
  const { error: insertAssErr } = await supabase
    .from("project_aannames")
    .insert(
      aannames.map(a => ({
        project_id,
        calculatie_id,
        aanname_code: a.code,
        omschrijving: a.omschrijving,
        bron: a.bron
      }))
    )

  assert(!insertAssErr, "ASSUME_INSERT_FAILED")

  /*
  ============================
  RAPPORT REGISTREREN
  ============================
  */
  await supabase.from("project_reports").insert({
    project_id,
    calculatie_id,
    report_type: "assumptions",
    status: "generated",
    generated_at: new Date().toISOString(),
    metadata: {
      regels: regels.length
    }
  })

  /*
  ============================
  LOG DONE
  ============================
  */
  await supabase
    .from("project_initialization_log")
    .update({
      status: "done",
      finished_at: new Date().toISOString()
    })
    .eq("project_id", project_id)
    .eq("module", "AANNAMES")

  /*
  ============================
  SLUIT TASK + VOLGENDE STAP
  ============================
  */
  if (task.id) {
    await supabase
      .from("executor_tasks")
      .update({ status: "done" })
      .eq("id", task.id)
  }

  const { error: nextErr } = await supabase.from("executor_tasks").insert({
    project_id,
    action: "generate_risk_report",
    payload: { project_id },
    status: "open",
    assigned_to: "executor"
  })

  assert(!nextErr, "ASSUME_NEXT_TASK_FAILED")

  return {
    state: "DONE",
    project_id,
    calculatie_id,
    aannames: aannames.length
  }
}

import { supabase } from "../../lib/supabase.js";


function assert(cond, msg) {
  if (!cond) throw new Error(msg)
}

export async function handleGenerateRiskReport(task) {
  assert(task && (task.project_id || task.payload?.project_id), "RISK_NO_PROJECT_ID")
  const project_id = task.project_id || task.payload.project_id

  /*
  ============================
  START LOG
  ============================
  */
  await supabase.from("project_initialization_log").insert({
    project_id,
    module: "RISICO",
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

  assert(!calcErr && calculatie, "RISK_NO_CALCULATIE")
  const calculatie_id = calculatie.id

  /*
  ============================
  INPUT DATA
  ============================
  */
  const { data: regels, error: regelsErr } = await supabase
    .from("calculatie_regels")
    .select("stabu_code, totaal")
    .eq("calculatie_id", calculatie_id)

  assert(!regelsErr, "RISK_REGELS_FETCH_FAILED")
  assert(regels && regels.length > 0, "RISK_NO_REGELS")

  /*
  ============================
  RISICO ANALYSE
  ============================
  */
  let bouwsom = 0
  for (const r of regels) {
    bouwsom += Number(r.totaal || 0)
  }

  const risicoPercentage =
    bouwsom > 1_000_000 ? 0.12 :
    bouwsom > 500_000  ? 0.10 :
    bouwsom > 250_000  ? 0.08 :
                          0.06

  const risicoBedrag = Math.round(bouwsom * risicoPercentage)

  const risicoItems = [
    {
      code: "ONTWERP",
      omschrijving: "Ontwerponzekerheden en revisies",
      impact: Math.round(risicoBedrag * 0.25)
    },
    {
      code: "MARKT",
      omschrijving: "Prijsfluctuaties materialen",
      impact: Math.round(risicoBedrag * 0.30)
    },
    {
      code: "UITVOERING",
      omschrijving: "Uitvoeringsfouten en faalkosten",
      impact: Math.round(risicoBedrag * 0.25)
    },
    {
      code: "PLANNING",
      omschrijving: "Vertragingen en gevolgkosten",
      impact: Math.round(risicoBedrag * 0.20)
    }
  ]

  /*
  ============================
  OPSCHONEN OUDE RISICO’S
  ============================
  */
  await supabase
    .from("project_risicos")
    .delete()
    .eq("project_id", project_id)

  /*
  ============================
  RISICO’S OPSLAAN
  ============================
  */
  const { error: insertRiskErr } = await supabase
    .from("project_risicos")
    .insert(
      risicoItems.map(r => ({
        project_id,
        calculatie_id,
        risico_code: r.code,
        omschrijving: r.omschrijving,
        impact_bedrag: r.impact
      }))
    )

  assert(!insertRiskErr, "RISK_INSERT_FAILED")

  /*
  ============================
  RAPPORT REGISTREREN
  ============================
  */
  await supabase.from("project_reports").insert({
    project_id,
    calculatie_id,
    report_type: "risk",
    status: "generated",
    generated_at: new Date().toISOString(),
    metadata: {
      bouwsom,
      risico_percentage: risicoPercentage,
      risico_bedrag: risicoBedrag
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
    .eq("module", "RISICO")

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
    action: "rapportage",
    payload: { project_id },
    status: "open",
    assigned_to: "executor"
  })

  assert(!nextErr, "RISK_NEXT_TASK_FAILED")

  return {
    state: "DONE",
    project_id,
    calculatie_id,
    bouwsom,
    risico_bedrag: risicoBedrag
  }
}

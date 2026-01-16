import { supabase } from "../../lib/supabase.js";


/*
====================================================
FINALIZE REKENWOLK – EINDPRODUCT
====================================================
- Berekent ECHTE totalen
- Schrijft naar calculaties
- Zet workflow_status = done
- Sluit logs en executor_tasks
- GEEN aannames
*/

export async function handleFinalizeRekenwolk(task) {
  if (!task) {
    throw new Error("FINALIZE_NO_TASK")
  }

  const project_id =
    task.project_id ||
    task.payload?.project_id ||
    null

  if (!project_id) {
    throw new Error("FINALIZE_PROJECT_ID_MISSING")
  }

  /*
  ============================
  HAAL CALCULATIE OP
  ============================
  */
  const { data: calculatie, error: calcError } = await supabase
    .from("calculaties")
    .select("id")
    .eq("project_id", project_id)
    .single()

  if (calcError || !calculatie) {
    throw new Error("FINALIZE_CALCULATIE_NOT_FOUND")
  }

  const calculatie_id = calculatie.id

  /*
  ============================
  HAAL REGELS OP
  ============================
  */
  const { data: regels, error: regelsError } = await supabase
    .from("calculatie_regels")
    .select("kostprijs, verkoopprijs, hoeveelheid")
    .eq("calculatie_id", calculatie_id)

  if (regelsError) {
    throw new Error("FINALIZE_REGELS_FETCH_FAILED: " + regelsError.message)
  }

  let totaalKostprijs = 0
  let totaalVerkoopprijs = 0

  for (const r of regels || []) {
    const qty = Number(r.hoeveelheid || 0)
    const kost = Number(r.kostprijs || 0)
    const verkoop = Number(r.verkoopprijs || 0)

    totaalKostprijs += kost * qty
    totaalVerkoopprijs += verkoop * qty
  }

  const marge = totaalVerkoopprijs - totaalKostprijs

  /*
  ============================
  UPDATE CALCULATIE
  ============================
  */
  const { error: updateCalcError } = await supabase
    .from("calculaties")
    .update({
      kostprijs: totaalKostprijs,
      verkoopprijs: totaalVerkoopprijs,
      marge: marge,
      status: "done",
      workflow_status: "done"
    })
    .eq("id", calculatie_id)

  if (updateCalcError) {
    throw new Error("FINALIZE_CALCULATIE_UPDATE_FAILED: " + updateCalcError.message)
  }

  /*
  ============================
  SLUIT REKENWOLK LOG
  ============================
  */
  await supabase
    .from("project_initialization_log")
    .update({
      status: "done",
      finished_at: new Date().toISOString()
    })
    .eq("project_id", project_id)
    .eq("module", "REKENWOLK")

  /*
  ============================
  SLUIT EXECUTOR TASK
  ============================
  */
  if (task.id) {
    await supabase
      .from("executor_tasks")
      .update({ status: "done" })
      .eq("id", task.id)
  }

  return {
    state: "DONE",
    project_id,
    calculatie_id,
    kostprijs: totaalKostprijs,
    verkoopprijs: totaalVerkoopprijs,
    marge
  }
}

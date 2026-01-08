import { createClient } from "@supabase/supabase-js"
import { TwoJoursWriter } from "../../builder/pdf/TwoJoursWriter.js"

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
)

const CALCULATION_MODELS = {
  nieuwbouw: {
    AK_PCT: 0.07,
    ABK_PCT: 0.06,
    WINST_PCT: 0.05,
    RISICO_PCT: 0.02,
    NORM_FACTOR: 1.0,
    label: 'Nieuwbouw',
    assumptions: ['Volledige realisatie vanaf casco.', 'Gebruik van nieuwbouw-kengetallen.', 'Volledige E/W-installaties.'],
  },
  transformatie: {
    AK_PCT: 0.08,
    ABK_PCT: 0.07,
    WINST_PCT: 0.06,
    RISICO_PCT: 0.08,
    NORM_FACTOR: 0.9,
    label: 'Transformatie',
    assumptions: ['Uitgangspunt is een bestaand casco.', 'Hogere onzekerheidsmarge door bestaande staat.', 'Kosten gesplitst in behoud, aanpassing, toevoeging.'],
  },
  renovatie: {
    AK_PCT: 0.09,
    ABK_PCT: 0.07,
    WINST_PCT: 0.06,
    RISICO_PCT: 0.10,
    NORM_FACTOR: 0.85,
    label: 'Renovatie',
    assumptions: ['Geen nieuw casco.', 'Focus op vervanging, herstel en modernisering.', 'Normuren lager dan nieuwbouw.'],
  },
  uitbreiding: {
    AK_PCT: 0.08,
    ABK_PCT: 0.06,
    WINST_PCT: 0.05,
    RISICO_PCT: 0.06,
    NORM_FACTOR: 1.0,
    label: 'Uitbreiding',
    assumptions: ['Strikte scheiding tussen nieuw deel en aansluiting op bestaand.', 'Extra risico op constructie en installaties.'],
  },
  verduurzaming: {
    AK_PCT: 0.06,
    ABK_PCT: 0.05,
    WINST_PCT: 0.05,
    RISICO_PCT: 0.04,
    NORM_FACTOR: 0.9,
    label: 'Verduurzaming',
    assumptions: ['Focus op isolatie, installaties en energieprestatie.', 'Beperkte casco- en afbouwkosten.'],
  },
  default: {
    AK_PCT: 0.08,
    ABK_PCT: 0.06,
    WINST_PCT: 0.05,
    RISICO_PCT: 0.03,
    NORM_FACTOR: 1.0,
    label: 'Standaard (Generiek)',
    assumptions: ['Generieke rekenmethode toegepast bij gebrek aan specifiek type.'],
  }
};


/*
=====================================
CALCULATIE GARANTEREN
=====================================
*/
async function ensureCalculatie(project_id) {
  const { data: existing, error } = await supabase
    .from("calculaties")
    .select("id")
    .eq("project_id", project_id)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle()

  if (error) throw error
  if (existing) return existing.id

  const { data: insertErr } = await supabase
    .from("calculaties")
    .insert({
      project_id,
      workflow_status: "initialized",
      created_at: new Date().toISOString()
    })
    .select("id")
    .single()

  if (insertErr) throw insertErr
  return data.id
}

export async function handleStartRekenwolk(task) {
  if (!task?.id || !task.project_id) return

  const taskId = task.id
  const project_id = task.project_id
  const calculation_run_id = task.calculation_run_id || task.payload?.calculation_run_id;
  const now = new Date().toISOString()

  try {
    /* TASK → RUNNING */
    await supabase
      .from("executor_tasks")
      .update({ status: "running", started_at: now })
      .eq("id", taskId)

    const calcId = await ensureCalculatie(project_id);

    // LAAG 1: TYPE-CONSISTENTIE & REKENNIVEAU-DISCIPLINE
    const { data: runData, error: runError } = await supabase
      .from('calculation_runs')
      .select('calculation_type, reken_niveau')
      .eq('id', calculation_run_id)
      .single();

    if (runError && runError.code !== 'PGRST116') throw new Error(`Failed to fetch calculation run data: ${runError.message}`);

    const calculationType = runData?.calculation_type || 'default';
    const model = CALCULATION_MODELS[calculationType] || CALCULATION_MODELS.default;

    // LAAG 2: CONTEXT-VOLDOENDEHEID
    const { data: posten, error: postenError } = await supabase
      .from("stabu_project_posten")
      .select(`
        stabu_code,
        omschrijving,
        eenheid,
        normuren,
        arbeidsprijs,
        materiaalprijs,
        hoeveelheid,
        oa_perc,
        stelp_eenh
      `)
      .eq("project_id", project_id)
      .eq("geselecteerd", true)

    if (postenError) throw postenError;
    if (!Array.isArray(posten) || posten.length === 0) {
       // Onvoldoende input → markeer als indicatief en faal niet, maar stop de calculatie.
       if (calculation_run_id) {
         await supabase.from('calculation_runs').update({
           status: 'completed_indicative',
           current_step: 'Onvoldoende input',
           error: 'Geen STABU-posten gevonden om te calculeren. Uitkomst is indicatief.',
           updated_at: now,
         }).eq('id', calculation_run_id);
       }
       throw new Error("NO_PROJECT_STABU_POSTEN: Input onvoldoende voor betrouwbare calculatie.");
    }

    /*
    =================================================
    2. REKENWOLK – TYPE-AFHANKELIJKE LOGICA
    =================================================
    */
    const regels = []
    let kostprijs = 0

    for (const p of posten) {
      const hoeveelheid = p.hoeveelheid ?? 1;

      // LAAG 4: VAKINHOUDELIJKE PLAUSIBILITEIT
      const normuren = (p.normuren ?? 0) * model.NORM_FACTOR; // Correctie op normuren
      const uren = normuren

      const loonkosten = uren * (p.arbeidsprijs ?? 0)
      const materiaal = (p.materiaalprijs ?? 0) * hoeveelheid
      const subtotaal = loonkosten + materiaal

      kostprijs += subtotaal

      // Regel-opslagen (indien aanwezig)
      const oa_perc = p.oa_perc ?? null
      const oa = oa_perc ? subtotaal * oa_perc : null

      const stelp_eenh = p.stelp_eenh ?? null
      const stelposten = stelp_eenh ? stelp_eenh * hoeveelheid : null

      const totaal =
        subtotaal +
        (oa ?? 0) +
        (stelposten ?? 0)

      regels.push({
        stabu_code: p.stabu_code,
        omschrijving: p.omschrijving,
        hoeveelheid,
        eenheid: p.eenheid,
        normuren: p.normuren, // Originele normuren voor weergave
        uren, // Gecorrigeerde uren
        loonkosten,
        prijs_eenh: hoeveelheid ? subtotaal / hoeveelheid : 0,
        materiaalprijs: p.materiaalprijs,
        materiaal,
        oa_perc,
        oa,
        stelp_eenh,
        stelposten,
        totaal
      })
    }

    /*
    =================================================
    3. PROJECTTOTALEN (TYPE-AFHANKELIJK)
    =================================================
    */
    // LAAG 5: ONZEKERHEIDSLOGICA
    const ak = kostprijs * model.AK_PCT
    const abk = kostprijs * model.ABK_PCT
    const winst = kostprijs * model.WINST_PCT
    const risico = kostprijs * model.RISICO_PCT // Type-specifieke risico-opslag

    const verkoopprijs =
      kostprijs + ak + abk + winst + risico

    /*
    =================================================
    4. PDF GENEREREN
    =================================================
    */
    const pdf = await TwoJoursWriter.open(project_id)

    pdf.drawCalculatieRegels(regels, {
      kostprijs,
      ak,
      abk,
      winst,
      risico,
      verkoopprijs,
      model: model, // Geef model door voor weergave van aannames
    })

    pdf.drawStaartblad()

    const pdfUrl = await pdf.save()

    await supabase
      .from("projects")
      .update({ pdf_url: pdfUrl })
      .eq("id", project_id)

    if (calculation_run_id) {
      const { error: runUpdateError } = await supabase
        .from("calculation_runs")
        .update({
          status: 'completed',
          current_step: 'completed',
          updated_at: now
        })
        .eq('id', calculation_run_id)

      if (runUpdateError) throw runUpdateError
    }

    /* TASK → COMPLETED */
    await supabase
      .from("executor_tasks")
      .update({
        status: "completed",
        finished_at: now
      })
      .eq("id", taskId)

  } catch (err) {
    const error_timestamp = new Date().toISOString();
    await supabase
      .from("executor_tasks")
      .update({
        status: "failed",
        error: err.message,
        finished_at: error_timestamp
      })
      .eq("id", taskId)

    if (calculation_run_id) {
      await supabase
        .from('calculation_runs')
        .update({
          status: 'failed',
          current_step: 'error',
          error: err.message,
          updated_at: error_timestamp
        })
        .eq('id', calculation_run_id);
    }
  }
}

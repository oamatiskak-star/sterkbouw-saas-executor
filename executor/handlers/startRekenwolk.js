import { createClient } from "@supabase/supabase-js"
import { TwoJoursWriter } from "../../builder/pdf/TwoJoursWriter.js"

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
)

const CALCULATION_MODELS = {
  nieuwbouw: {
    label: 'Nieuwbouw',
    description: 'Calculatie voor volledig nieuwe bouwprojecten, startend vanaf de fundering.',
    calculation_flow: [
      'fundering',
      'casco',
      'schil',
      'installaties',
      'afbouw'
    ],
    forced_rules: {
      must_include: ['fundering', 'casco', 'schil', 'installaties', 'afbouw'],
      may_include: [],
      must_exclude: ['bestaande_constructie_analyse', 'gedeeltelijke_sloop']
    },
    logic_constraints: {
      allow_overlap_existing_new: false,
      allow_partial_demolition: false,
      require_existing_structure_analysis: false
    },
    default_assumptions: {
      reuse_percentage: 0,
      demolition_separate: true,
      installaties_volledig_vervangen: true
    },
    percentages: {
      ak: 7,
      abk: 6,
      winst: 5,
      risico: 2
    },
    norm_factor: 1
  },
  transformatie: {
    label: 'Transformatie',
    description: 'Herbestemming of ingrijpende wijziging van een bestaand gebouw, inclusief aanpassing en nieuwe toevoegingen.',
    calculation_flow: [
      'bestaande_constructie_analyse',
      'fundering',
      'casco',
      'schil',
      'installaties',
      'afbouw'
    ],
    forced_rules: {
      must_include: ['bestaande_constructie_analyse'],
      may_include: ['gedeeltelijke_sloop'],
      must_exclude: []
    },
    logic_constraints: {
      allow_overlap_existing_new: true,
      allow_partial_demolition: true,
      require_existing_structure_analysis: true
    },
    default_assumptions: {
      reuse_percentage: null,
      demolition_separate: false,
      installaties_volledig_vervangen: false
    },
    percentages: {
      ak: 8,
      abk: 7,
      winst: 6,
      risico: 8
    },
    norm_factor: 1
  },
  renovatie: {
    label: 'Renovatie',
    description: 'Vernieuwing of verbetering van een bestaand gebouw met maximaal behoud van de bestaande structuur.',
    calculation_flow: [
      'bestaande_constructie_analyse',
      'schil',
      'installaties',
      'afbouw'
    ],
    forced_rules: {
      must_include: [],
      may_include: ['maximaal_hergebruik'],
      must_exclude: ['nieuwe_fundering_totaal']
    },
    logic_constraints: {
      allow_overlap_existing_new: true,
      allow_partial_demolition: true,
      require_existing_structure_analysis: true
    },
    default_assumptions: {
      reuse_percentage: null,
      demolition_separate: false,
      installaties_volledig_vervangen: false
    },
    percentages: {
      ak: 9,
      abk: 7,
      winst: 6,
      risico: 10
    },
    norm_factor: 1
  },
  uitbreiding: {
    label: 'Uitbreiding',
    description: 'Toevoeging van nieuwe bouwdelen aan een bestaand gebouw, met focus op koppeling.',
    calculation_flow: [
      'bestaand_nieuw_koppeling',
      'fundering',
      'casco',
      'schil',
      'installaties',
      'afbouw'
    ],
    forced_rules: {
      must_include: ['bestaand_nieuw_koppeling'],
      may_include: [],
      must_exclude: ['sloop_bestaand_gebouw_totaal']
    },
    logic_constraints: {
      allow_overlap_existing_new: true,
      allow_partial_demolition: false,
      require_existing_structure_analysis: true
    },
    default_assumptions: {
      reuse_percentage: 0,
      demolition_separate: false,
      installaties_volledig_vervangen: false
    },
    percentages: {
      ak: 8,
      abk: 6,
      winst: 5,
      risico: 6
    },
    norm_factor: 1
  },
  verduurzaming: {
    label: 'Verduurzaming',
    description: 'Maatregelen gericht op energiebesparing en duurzaamheid van een bestaand gebouw.',
    calculation_flow: [
      'schil',
      'installaties',
      'energie_maatregelen'
    ],
    forced_rules: {
      must_include: ['schil', 'installaties', 'energie_maatregelen'],
      may_include: [],
      must_exclude: ['fundering', 'casco']
    },
    logic_constraints: {
      allow_overlap_existing_new: false,
      allow_partial_demolition: false,
      require_existing_structure_analysis: true
    },
    default_assumptions: {
      reuse_percentage: null,
      demolition_separate: false,
      installaties_volledig_vervangen: false
    },
    percentages: {
      ak: 6,
      abk: 5,
      winst: 5,
      risico: 4
    },
    norm_factor: 1
  },
  default: {
    label: 'Standaard (Generiek)',
    description: 'Generieke rekenmethode toegepast bij gebrek aan specifiek type.',
    calculation_flow: [
      'fundering',
      'casco',
      'schil',
      'installaties',
      'afbouw'
    ],
    forced_rules: {
      must_include: [],
      may_include: [],
      must_exclude: []
    },
    logic_constraints: {
      allow_overlap_existing_new: true,
      allow_partial_demolition: true,
      require_existing_structure_analysis: true
    },
    default_assumptions: {
      reuse_percentage: null,
      demolition_separate: false,
      installaties_volledig_vervangen: false
    },
    percentages: {
      ak: 8,
      abk: 6,
      winst: 5,
      risico: 3
    },
    norm_factor: 1
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
      const normuren = (p.normuren ?? 0) * model.norm_factor; // Correctie op normuren
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
    const ak = kostprijs * (model.percentages.ak / 100)
    const abk = kostprijs * (model.percentages.abk / 100)
    const winst = kostprijs * (model.percentages.winst / 100)
    const risico = kostprijs * (model.percentages.risico / 100) // Type-specifieke risico-opslag

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
          pdf_url: pdfUrl,
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

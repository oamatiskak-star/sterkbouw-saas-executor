const { createClient } = require('@supabase/supabase-js');
const PDFDocument = require('pdfkit');

// =====================================================
// ENV CHECK
// =====================================================
if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
  console.error('Missing environment variables: SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}

// =====================================================
// SUPABASE CLIENT
// =====================================================
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

// =====================================================
// POLLING CONFIG
// =====================================================

let isProcessing = false;   // 🔒 HARD GUARD TEGEN DUBBELE POLLING

// =====================================================
// MAIN POLLER
// =====================================================
async function pollAndProcess() {
  if (isProcessing) {
    console.log('[EXECUTOR] ⏳ Poll skipped: executor busy');
    return;
  }

  isProcessing = true;
  console.log('[EXECUTOR] 🔍 Polling for queued calculation_runs...');

  try {
    // -------------------------------------------------
    // 1. HAAL OUDEST QUEUED RUN OP
    // -------------------------------------------------
    const { data: run, error: queryError } = await supabase
      .from('calculation_runs')
      .select('*')
      .eq('status', 'queued')
      .order('created_at', { ascending: true })
      .limit(1)
      .maybeSingle();

    if (queryError) {
      console.error('[EXECUTOR] Query error:', queryError);
      return;
    }

    if (!run) {
      console.log('[EXECUTOR] No queued runs found');
      return;
    }

    console.log(`[EXECUTOR] ▶ Picked run ${run.id} (project ${run.project_id})`);

    // -------------------------------------------------
    // 2. LOCK RUN (QUEUED → RUNNING)
    // -------------------------------------------------
    const { data: locked, error: lockError } = await supabase
      .from('calculation_runs')
      .update({
        status: 'running',
        current_step: 'project_scan'
      })
      .eq('id', run.id)
      .eq('status', 'queued')
      .select()
      .maybeSingle();

    if (lockError) {
      console.error('[EXECUTOR] Lock error:', lockError);
      return;
    }

    if (!locked) {
      console.log('[EXECUTOR] Run already picked by another executor');
      return;
    }

    console.log(`[EXECUTOR] 🔒 Locked run ${run.id}`);

    // =================================================
    // 3. DOCUMENT ANALYSE
    // =================================================
    console.log('[EXECUTOR] 📄 Document analysis start');

    const { data: documents, error: docsError } = await supabase
      .from('document_sources')
      .select('*')
      .eq('project_id', run.project_id);

    if (docsError) throw docsError;

    console.log(`[EXECUTOR] 📄 Found ${documents.length} documents`);

    await supabase
      .from('calculation_runs')
      .update({ current_step: 'generate_stabu' })
      .eq('id', run.id);

    // =================================================
    // 4. STABU + CALCULATIE (DUMMY)
    // =================================================
    console.log('[EXECUTOR] 🧮 STABU mapping');

    let rows = generateDummyRows(run.calculation_type);
    rows = applyOverheads(rows, run.calculation_type);

    const totalAmount = rows.reduce(
      (sum, r) => sum + Number(r.regel_totaal || 0),
      0
    );

    // =================================================
    // 5. OPSLAAN RESULTATEN
    // =================================================
    const { data: version, error: versionError } = await supabase
      .from('calculation_versions')
      .insert({
        calculation_id: run.id,
        total_amount: totalAmount
      })
      .select()
      .single();

    if (versionError) throw versionError;

    const rowsPayload = rows.map(r => ({
      calculation_version_id: version.id,
      fase: r.fase,
      stabu_code: r.stabu_code,
      omschrijving: r.omschrijving,
      hoeveelheid: r.hoeveelheid,
      inkoop: r.inkoop,
      ak: r.ak,
      abk: r.abk,
      risk: r.risk,
      profit: r.profit,
      regel_totaal: r.regel_totaal
    }));

    const { error: rowsError } = await supabase
      .from('calculation_rows')
      .insert(rowsPayload);

    if (rowsError) throw rowsError;

    // =================================================
    // 6. PDF GENEREREN
    // =================================================
    console.log('[EXECUTOR] 📄 Generating 2jours PDF');

    const pdfBuffer = await generate2JoursPDF(rows, run, totalAmount);
    const pdfPath = `pdf/${run.id}.pdf`;

    const { error: uploadError } = await supabase.storage
      .from('sterkcalc')
      .upload(pdfPath, pdfBuffer, {
        contentType: 'application/pdf',
        upsert: true
      });

    if (uploadError) throw uploadError;

    // =================================================
    // 7. FINALIZE
    // =================================================
    await supabase
      .from('calculation_runs')
      .update({
        status: 'completed',
        current_step: 'completed',
        pdf_url: pdfPath
      })
      .eq('id', run.id);

    console.log(`[EXECUTOR] ✅ Calculation ${run.id} completed`);

  } catch (err) {
    console.error('[EXECUTOR] ❌ Fatal error:', err.message);

    if (err?.id) {
      await supabase
        .from('calculation_runs')
        .update({
          status: 'error',
          current_step: 'error'
        })
        .eq('id', err.id);
    }
  } finally {
    isProcessing = false;
  }
}

// =====================================================
// HELPERS
// =====================================================
function generateDummyRows(projectType) {
  return [
    {
      fase: 'ruwbouw',
      stabu_code: '2001',
      omschrijving: 'Fundering',
      hoeveelheid: 10,
      inkoop: 5000
    },
    {
      fase: 'afbouw',
      stabu_code: '3001',
      omschrijving: 'Vloeren',
      hoeveelheid: 50,
      inkoop: 2000
    }
  ];
}

function applyOverheads(rows, projectType) {
  const model = {
    nieuwbouw: { ak: 6, abk: 5, risk: 4, profit: 6 }
  }[projectType] || { ak: 6, abk: 5, risk: 4, profit: 6 };

  return rows.map(r => {
    const ak = r.inkoop * model.ak / 100;
    const abk = r.inkoop * model.abk / 100;
    const risk = r.inkoop * model.risk / 100;
    const profit = r.inkoop * model.profit / 100;
    return {
      ...r,
      ak,
      abk,
      risk,
      profit,
      regel_totaal: r.inkoop + ak + abk + risk + profit
    };
  });
}

async function generate2JoursPDF(rows, run, totalAmount) {
  return new Promise(resolve => {
    const doc = new PDFDocument();
    const buffers = [];
    doc.on('data', buffers.push.bind(buffers));
    doc.on('end', () => resolve(Buffer.concat(buffers)));

    doc.fontSize(18).text('2JOURS Calculatie', { align: 'center' });
    doc.moveDown();
    doc.text(`Project: ${run.scenario_name || run.project_id}`);
    doc.text(`Type: ${run.calculation_type}`);
    doc.moveDown();

    rows.forEach(r => {
      doc.text(`${r.omschrijving} – € ${r.regel_totaal.toFixed(2)}`);
    });

    doc.moveDown();
    doc.fontSize(14).text(`Totaal: € ${totalAmount.toFixed(2)}`);
    doc.end();
  });
}

// =====================================================
// START EXECUTOR
// =====================================================
console.log('[EXECUTOR] 🚀 Executor started');
setInterval(pollAndProcess, POLL_INTERVAL);

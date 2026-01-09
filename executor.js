const { createClient } = require('@supabase/supabase-js');
const PDFDocument = require('pdfkit');

const ENABLE_CALCULATION_RUN_POLLING = process.env.EXECUTOR_POLL_SOURCE === "calculation_runs";
const HAS_SUPABASE_ENV = Boolean(process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY);
if (!HAS_SUPABASE_ENV) {
  console.error('Missing environment variables: SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY');
}

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const POLL_INTERVAL = 5000; // 5 seconds

async function pollAndProcess() {
  console.log('Polling for queued runs...');
  try {
    // Query for the oldest queued run
    const { data: run, error: queryError } = await supabase
      .from('calculation_runs')
      .select('*')
      .eq('status', 'queued')
      .order('created_at', { ascending: true })
      .limit(1)
      .maybeSingle();

    if (queryError) {
      console.error('Query error:', queryError);
      return;
    }

    if (!run) {
      console.log('No queued runs found');
      return;
    }

    console.log(`Found queued run: ${run.id}, project: ${run.project_id}, type: ${run.calculation_type}`);
    console.log(`PICKED RUN ${run.id}`);

    // Lock: update to running and set initial step
    const { data: updated, error: updateError } = await supabase
      .from('calculation_runs')
      .update({ status: 'running' })
      .eq('id', run.id)
      .eq('status', 'queued')
      .select();

    if (updateError) {
      console.error('Update to running error:', updateError);
      return;
    }

    if (!updated || updated.length === 0) {
      console.log(`Run ${run.id} already picked up by another executor`);
      return;
    }

    console.log(`Locked run ${run.id} for processing`);
    console.log(`STARTED PROCESSING RUN ${run.id}`);

    try {
      // STAP 1 — DOCUMENTEN ANALYSEREN
      console.log('DOCUMENT ANALYSIS START');
      const { data: documents, error: docsError } = await supabase
        .from('document_sources')
        .select('*')
        .eq('project_id', run.project_id);

      if (docsError) throw docsError;

      // Simulate analysis: log documents
      console.log(`Analyzed ${documents.length} documents for project ${run.project_id}`);

      // Update step if column exists
      try {
        await supabase.from('calculation_runs').update({ current_step: 'stabu_mapping' }).eq('id', run.id);
      } catch (stepError) {
        console.warn('Could not update current_step (column may not exist):', stepError.message);
      }

      // STAP 2 — STABU MAPPING
      console.log('STABU MAPPING START');
      // Simulate mapping: create dummy rows based on projectType
      let dummyRows = generateDummyRows(run.calculation_type);

      // Update step
      try {
        await supabase.from('calculation_runs').update({ current_step: 'calculating' }).eq('id', run.id);
      } catch (stepError) {
        console.warn('Could not update current_step:', stepError.message);
      }

      // STAP 3 — BEREKENEN
      console.log('CALCULATION START');
      // Rows are already calculated in dummy

      // FIXED-PRICE HERREKENING
      if (run.fixed_price) {
        const calculatedTotal = dummyRows.reduce((sum, row) => sum + parseFloat(row.inkoop), 0);
        const factor = run.fixed_price / calculatedTotal;
        dummyRows = dummyRows.map(row => ({
          ...row,
          inkoop: row.inkoop * factor
        }));
        console.log(`Applied fixed-price scaling: factor ${factor.toFixed(4)}`);
      }

      // Update step
      try {
        await supabase.from('calculation_runs').update({ current_step: 'applying_overheads' }).eq('id', run.id);
      } catch (stepError) {
        console.warn('Could not update current_step:', stepError.message);
      }

      // STAP 4 — OPSLAGEN TOEPASSEN
      console.log('OVERHEADS APPLIED');
      // Overheads are applied in generateDummyRows, but recalculate after fixed-price
      dummyRows = applyOverheads(dummyRows, run.calculation_type);

      // Update step to generating_pdf
      try {
        await supabase.from('calculation_runs').update({ current_step: 'generating_pdf' }).eq('id', run.id);
      } catch (stepError) {
        console.warn('Could not update current_step:', stepError.message);
      }

      // RESULTAAT OPSLAAN
      console.log('SAVING RESULTS');
      // Insert calculation_rows
      const { error: rowsError } = await supabase
        .from('calculation_rows')
        .insert(dummyRows.map(row => ({
          calculation_version_id: null, // will set after version
          fase: row.fase,
          stabu_code: row.stabu_code,
          omschrijving: row.omschrijving,
          hoeveelheid: row.hoeveelheid,
          inkoop: row.inkoop,
          ak: row.ak,
          abk: row.abk,
          risk: row.risk,
          profit: row.profit,
          regel_totaal: row.regel_totaal
        })));

      if (rowsError) throw rowsError;

      // Get the inserted rows to calculate total
      const totalAmount = dummyRows.reduce((sum, row) => sum + parseFloat(row.regel_totaal), 0);

      // Create calculation_version
      const { data: version, error: versionError } = await supabase
        .from('calculation_versions')
        .insert({
          calculation_id: run.id,
          total_amount: totalAmount,
          created_at: new Date()
        })
        .select()
        .single();

      if (versionError) throw versionError;

      // Update rows with version_id
      await supabase
        .from('calculation_rows')
        .update({ calculation_version_id: version.id })
        .eq('calculation_version_id', null); // assuming no others

      // GENERATE PDF
      console.log('GENERATING PDF');
      const pdfBuffer = await generate2JoursPDF(dummyRows, run, totalAmount);

      // Upload to Supabase Storage
      const filePath = `pdf/${run.id}.pdf`;
      const { error: uploadError } = await supabase.storage
        .from('sterkcalc')
        .upload(filePath, pdfBuffer, {
          contentType: 'application/pdf',
          upsert: true
        });

      if (uploadError) throw uploadError;

      // Update calculation_runs with pdf_url
      await supabase
        .from('calculation_runs')
        .update({ pdf_url: filePath })
        .eq('id', run.id);

      // STATUS AFHANDELING
      try {
        await supabase
          .from('calculation_runs')
          .update({ status: 'completed', current_step: 'completed' })
          .eq('id', run.id);
      } catch (stepError) {
        await supabase
          .from('calculation_runs')
          .update({ status: 'completed' })
          .eq('id', run.id);
      }

      console.log('CALCULATION COMPLETED');

    } catch (processError) {
      console.error(`Error processing run ${run.id}:`, processError);
      try {
        await supabase
          .from('calculation_runs')
          .update({ status: 'error', current_step: 'error' })
          .eq('id', run.id);
      } catch (stepError) {
        await supabase
          .from('calculation_runs')
          .update({ status: 'error' })
          .eq('id', run.id);
      }
    }

  } catch (err) {
    console.error('Polling error:', err);
  }
}

function generateDummyRows(projectType) {
  // Dummy rows based on projectType
  const baseRows = [
    { fase: 'voorbereiding', stabu_code: '1001', omschrijving: 'Voorbereiding werk', hoeveelheid: 1, inkoop: 1000 },
    { fase: 'ruwbouw', stabu_code: '2001', omschrijving: 'Fundering', hoeveelheid: 10, inkoop: 5000 },
    { fase: 'afbouw', stabu_code: '3001', omschrijving: 'Vloeren', hoeveelheid: 50, inkoop: 2000 },
  ];

  return baseRows; // Return without overheads initially
}

function applyOverheads(rows, projectType) {
  const models = {
    nieuwbouw: { ak: 6, abk: 5, risk: 4, profit: 6 },
    transformatie: { ak: 7, abk: 6, risk: 6, profit: 6 },
    renovatie: { ak: 8, abk: 6, risk: 7, profit: 5 },
    uitbreiding: { ak: 7, abk: 5, risk: 6, profit: 6 },
    verduurzaming: { ak: 6, abk: 4, risk: 3, profit: 5 },
  };

  const overheads = models[projectType] || models.nieuwbouw;

  return rows.map(row => {
    const ak = (row.inkoop * overheads.ak) / 100;
    const abk = (row.inkoop * overheads.abk) / 100;
    const risk = (row.inkoop * overheads.risk) / 100;
    const profit = (row.inkoop * overheads.profit) / 100;
    const regel_totaal = row.inkoop + ak + abk + risk + profit;
    return { ...row, ak, abk, risk, profit, regel_totaal };
  });
}

async function generate2JoursPDF(rows, run, totalAmount) {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument();
    const buffers = [];

    doc.on('data', buffers.push.bind(buffers));
    doc.on('end', () => {
      const pdfBuffer = Buffer.concat(buffers);
      resolve(pdfBuffer);
    });

    // Title page
    doc.fontSize(20).text('2JOURS Calculatie Rapport', { align: 'center' });
    doc.moveDown();
    doc.fontSize(14).text(`Project: ${run.scenario_name}`);
    doc.text(`Calculation Type: ${run.calculation_type}`);
    doc.text(`Date: ${new Date().toLocaleDateString()}`);
    doc.addPage();

    // Group rows by fase
    const grouped = {};
    rows.forEach(row => {
      if (!grouped[row.fase]) grouped[row.fase] = [];
      grouped[row.fase].push(row);
    });

    Object.keys(grouped).forEach(fase => {
      doc.fontSize(16).text(fase.toUpperCase());
      doc.moveDown();

      // Table header
      doc.fontSize(10).text('Omschrijving | Hoeveelheid | Inkoop | AK | ABK | Risico | Winst | Totaal', { underline: true });
      doc.moveDown();

      let subtotal = 0;
      grouped[fase].forEach(row => {
        doc.text(`${row.omschrijving} | ${row.hoeveelheid} | €${row.inkoop.toFixed(2)} | €${row.ak.toFixed(2)} | €${row.abk.toFixed(2)} | €${row.risk.toFixed(2)} | €${row.profit.toFixed(2)} | €${row.regel_totaal.toFixed(2)}`);
        subtotal += row.regel_totaal;
      });

      doc.moveDown();
      doc.fontSize(12).text(`Subtotaal ${fase}: €${subtotal.toFixed(2)}`, { bold: true });
      doc.moveDown();
    });

    doc.fontSize(14).text(`Eindtotaal: €${totalAmount.toFixed(2)}`, { bold: true });

    doc.end();
  });
}


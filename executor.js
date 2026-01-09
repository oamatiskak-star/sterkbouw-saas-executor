// =================================================================
// BOOTSTRAP & DEPENDENCY CHECK
// =================================================================
let createClient, PDFDocument, config;

try {
    const supabaseClient = require('@supabase/supabase-js');
    createClient = supabaseClient.createClient;
    PDFDocument = require('pdfkit');
    config = require('./config');
} catch (error) {
    console.error(`[EXECUTOR_FATAL] A critical dependency failed to load: ${error.message}`);
    console.error('[EXECUTOR_FATAL] This is likely because "npm install" has not been run or node_modules are missing.');
    process.exit(1);
}

// =================================================================
// LOGGING & GLOBAL STATE
// =================================================================

const LOG_PREFIXES = {
    main: '[EXECUTOR]',
    startup: '[EXECUTOR_START]',
    shutdown: '[EXECUTOR_SHUTDOWN]',
    poll: '[EXECUTOR_POLL]',
    guard: '[POLL_GUARD_BLOCK]',
    task: '[TASK]',
};

const EXECUTOR_STATE_ID = "00000000-0000-0000-0000-000000000001";

let isShuttingDown = false;
let poller; // To hold the setInterval ID
let isPollingInFlight = false;
let isPollingActive = false;

async function getExecutorAllowed() {
    try {
        const { data, error } = await supabase
            .from('executor_state')
            .select('allowed')
            .eq('id', EXECUTOR_STATE_ID)
            .maybeSingle();

        if (error || !data) {
            log(LOG_PREFIXES.guard, "[POLLING_BLOCKED_GUARD]");
            return false;
        }

        return data.allowed === true;
    } catch {
        log(LOG_PREFIXES.guard, "[POLLING_BLOCKED_GUARD]");
        return false;
    }
}

async function setExecutorAllowedFalse() {
    try {
        await supabase
            .from('executor_state')
            .update({ allowed: false, updated_at: new Date().toISOString() })
            .eq('id', EXECUTOR_STATE_ID);
    } catch {
        log(LOG_PREFIXES.guard, "[POLLING_BLOCKED_GUARD]");
    }
}

async function hasActiveTasks() {
    try {
        const { data, error } = await supabase
            .from('executor_tasks')
            .select('id')
            .eq('assigned_to', 'executor')
            .in('status', ['open', 'running'])
            .limit(1)
            .maybeSingle();

        if (error) {
            stopPolling();
            log(LOG_PREFIXES.guard, "[POLLING_BLOCKED_GUARD]");
            return null;
        }

        return Boolean(data);
    } catch {
        stopPolling();
        log(LOG_PREFIXES.guard, "[POLLING_BLOCKED_GUARD]");
        return null;
    }
}

function stopPolling() {
    if (poller) {
        clearInterval(poller);
        poller = undefined;
    }
    isPollingActive = false;
}

async function startPollingIfNeeded() {
    if (isShuttingDown || isPollingActive) {
        return;
    }
    if (!config.isExecutorEnabled) {
        log(LOG_PREFIXES.startup, "[EXECUTOR_IDLE_GUARD]");
        return;
    }
    const isAllowed = await getExecutorAllowed();
    if (!isAllowed) {
        log(LOG_PREFIXES.startup, "[EXECUTOR_IDLE_GUARD]");
        return;
    }
    const hasTasks = await hasActiveTasks();
    if (!hasTasks) {
        log(LOG_PREFIXES.startup, "[EXECUTOR_IDLE_GUARD]");
        return;
    }
    isPollingActive = true;
    log(LOG_PREFIXES.startup, "[EXECUTOR_TRIGGERED_BY_TASK]");
    log(LOG_PREFIXES.startup, "[POLLING_STARTED]");
    poller = setInterval(pollAndProcess, config.pollInterval);
    pollAndProcess();
}

const log = (prefix, message) => console.log(`${prefix} ${message}`);

// =================================================================
// SUPABASE CLIENT & HELPERS
// =================================================================

// The client is initialized within main() after config validation.
let supabase = null;

/**
 * Centralized function to update the status of a run.
 * @param {string} runId - The ID of the calculation run.
 * @param {'running' | 'completed' | 'failed' | 'queued'} status - The new status.
 * @param {string | null} finalStep - The final step description (e.g., 'completed', 'error').
 * @param {string | null} errorMessage - An error message to store, if any.
 */
async function updateRunStatus(runId, status, finalStep = null, errorMessage = null) {
    try {
        const updatePayload = {
            status,
            ...(finalStep && { current_step: finalStep }),
            ...(errorMessage && { error_details: errorMessage }),
        };

        const { error } = await supabase
            .from('calculation_runs')
            .update(updatePayload)
            .eq('id', runId);

        if (error) {
            log(LOG_PREFIXES.task, `Failed to update run ${runId} to status ${status}: ${error.message}`);
        }
    } catch (err) {
        log(LOG_PREFIXES.task, `CRITICAL: An unexpected error occurred while updating status for run ${runId} to ${status}: ${err.message}`);
    }
}


// =================================================================
// TASK PROCESSING LOGIC (The "Action")
// =================================================================

/**
 * The core business logic for processing a calculation run.
 * This function is designed to be self-contained and throw on failure.
 * @param {object} run - The calculation run object from Supabase.
 */
async function executeCalculation(run) {
    log(LOG_PREFIXES.task, `Starting processing for run ${run.id}...`);

    // The original logic from the old executor.js file is placed here.
    // STAP 1 — DOCUMENTEN ANALYSEREN
    await supabase.from('calculation_runs').update({ current_step: 'document_analysis' }).eq('id', run.id);
    const { data: documents, error: docsError } = await supabase
        .from('document_sources')
        .select('*')
        .eq('project_id', run.project_id);
    if (docsError) throw new Error(`Document analysis failed: ${docsError.message}`);
    log(LOG_PREFIXES.task, `Analyzed ${documents.length} documents for project ${run.project_id}`);

    // STAP 2 — STABU MAPPING (Simulated)
    await supabase.from('calculation_runs').update({ current_step: 'stabu_mapping' }).eq('id', run.id);
    let dummyRows = generateDummyRows(run.calculation_type);

    // STAP 3 — BEREKENEN & FIXED-PRICE
    await supabase.from('calculation_runs').update({ current_step: 'calculating' }).eq('id', run.id);
    if (run.fixed_price) {
        const calculatedTotal = dummyRows.reduce((sum, row) => sum + parseFloat(row.inkoop), 0);
        if (calculatedTotal > 0) {
            const factor = run.fixed_price / calculatedTotal;
            dummyRows = dummyRows.map(row => ({...row, inkoop: row.inkoop * factor }));
            log(LOG_PREFIXES.task, `Applied fixed-price scaling: factor ${factor.toFixed(4)}`);
        }
    }

    // STAP 4 — OPSLAGEN TOEPASSEN
    await supabase.from('calculation_runs').update({ current_step: 'applying_overheads' }).eq('id', run.id);
    dummyRows = applyOverheads(dummyRows, run.calculation_type);

    // STAP 5 - RESULTAAT OPSLAAN
    await supabase.from('calculation_runs').update({ current_step: 'saving_results' }).eq('id', run.id);
    // This entire block should be a transaction, but we follow the original logic for now.
    const { error: rowsError } = await supabase.from('calculation_rows').insert(dummyRows.map(row => ({
        calculation_version_id: null, // Placeholder
        project_id: run.project_id, // Important for association
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
    if (rowsError) throw new Error(`Failed to save calculation rows: ${rowsError.message}`);

    const totalAmount = dummyRows.reduce((sum, row) => sum + parseFloat(row.regel_totaal), 0);
    const { data: version, error: versionError } = await supabase.from('calculation_versions').insert({
        calculation_run_id: run.id,
        total_amount: totalAmount,
        project_id: run.project_id,
    }).select().single();
    if (versionError) throw new Error(`Failed to create calculation version: ${versionError.message}`);

    // STAP 6 - PDF GENEREREN & OPSLAAN
    await supabase.from('calculation_runs').update({ current_step: 'generating_pdf' }).eq('id', run.id);
    const pdfBuffer = await generate2JoursPDF(dummyRows, run, totalAmount);
    const filePath = `public/calculations/${run.id}/2jours_report.pdf`;
    const { error: uploadError } = await supabase.storage.from('projects').upload(filePath, pdfBuffer, {
        contentType: 'application/pdf',
        upsert: true
    });
    if (uploadError) throw new Error(`Failed to upload PDF: ${uploadError.message}`);

    const { data: urlData } = supabase.storage.from('projects').getPublicUrl(filePath);
    await supabase.from('calculation_runs').update({ pdf_url: urlData.publicUrl }).eq('id', run.id);

    log(LOG_PREFIXES.task, `Run ${run.id} processing finished successfully.`);
}

/**
 * Wraps the task execution with timeout and error handling guards.
 * @param {object} run - The calculation run object from Supabase.
 */
async function processRunWithGuards(run) {
    log(LOG_PREFIXES.task, `[TASK_PICKED] Run ${run.id} for project ${run.project_id}. Type: ${run.calculation_type}`);

    const taskPromise = executeCalculation(run);
    const timeoutPromise = new Promise((_, reject) =>
        setTimeout(() => reject(new Error('Task execution timed out')), config.taskTimeout)
    );

    try {
        await Promise.race([taskPromise, timeoutPromise]);
        await updateRunStatus(run.id, 'completed', 'completed');
        log(LOG_PREFIXES.task, `[TASK_COMPLETED] Run ${run.id} finished successfully.`);
    } catch (error) {
        log(LOG_PREFIXES.task, `[TASK_ABORTED] Run ${run.id} failed: ${error.message}`);
        await updateRunStatus(run.id, 'failed', 'error', error.message);
    }
}


// =================================================================
// POLLING LOGIC
// =================================================================

async function pollAndProcess() {
    if (isPollingInFlight) {
        log(LOG_PREFIXES.guard, "[POLLING_BLOCKED_GUARD]");
        return;
    }
    if (!config.isExecutorEnabled || !isPollingActive) {
        log(LOG_PREFIXES.startup, "[EXECUTOR_IDLE_GUARD]");
        stopPolling();
        return;
    }
    const isAllowed = await getExecutorAllowed();
    if (!isAllowed) {
        log(LOG_PREFIXES.guard, "[POLLING_BLOCKED_GUARD]");
        stopPolling();
        return;
    }
    isPollingInFlight = true;
    try {
        try {
        if (isShuttingDown) {
            log(LOG_PREFIXES.poll, 'Polling stopped due to shutdown signal.');
            return;
        }

        log(LOG_PREFIXES.poll, 'Polling for a queued run...');

        // 1. Find a potential task
        const { data: potentialRun, error: queryError } = await supabase
            .from('calculation_runs')
            .select('*')
            .eq('status', 'queued')
            .in('calculation_type', config.allowedActions)
            .order('created_at', { ascending: true })
            .limit(1)
            .maybeSingle();

        if (queryError) {
            log(LOG_PREFIXES.guard, "[POLLING_BLOCKED_GUARD]");
            stopPolling();
            return;
        }

        if (!potentialRun) {
            log(LOG_PREFIXES.poll, 'No actionable runs found.');
            return;
        }

        log(LOG_PREFIXES.poll, `Found potential run: ${potentialRun.id}. Attempting to lock...`);

        // 2. Attempt to lock the task atomically
        const { data: lockedRun, error: lockError } = await supabase
            .from('calculation_runs')
            .update({ status: 'running', current_step: 'initializing' })
            .eq('id', potentialRun.id)
            .eq('status', 'queued') // Ensure it's still queued
            .select()
            .single();

        if (lockError) {
            // This could happen if another executor grabs the task between our select and update.
            log(LOG_PREFIXES.poll, `Failed to lock run ${potentialRun.id}. It might have been taken. Error: ${lockError.message}`);
            return;
        }

        if (!lockedRun) {
            log(LOG_PREFIXES.poll, `Run ${potentialRun.id} was not locked. It was likely processed by another instance.`);
            return;
        }

        // 3. Process the locked task (don't await, let it run in the background)
        processRunWithGuards(lockedRun);
        } catch {
            log(LOG_PREFIXES.guard, "[POLLING_BLOCKED_GUARD]");
            stopPolling();
        }
    } finally {
        isPollingInFlight = false;
        const hasTasks = await hasActiveTasks();
        if (hasTasks === null) {
            return;
        }
        if (!hasTasks) {
            await setExecutorAllowedFalse();
            log(LOG_PREFIXES.poll, "[EXECUTOR_CHAIN_COMPLETE]");
            log(LOG_PREFIXES.poll, "[POLLING_STOPPED_IDLE]");
            stopPolling();
            return;
        }
    }
}


// =================================================================
// STARTUP, SHUTDOWN, & MAIN
// =================================================================

function shutdown(immediate = false) {
    if (isShuttingDown) return;
    isShuttingDown = true;
    log(LOG_PREFIXES.shutdown, 'Shutdown sequence initiated...');
    stopPolling();
    log(LOG_PREFIXES.shutdown, 'Polling stopped.');

    if (immediate) {
        log(LOG_PREFIXES.shutdown, 'Immediate shutdown requested. Exiting.');
        process.exit(1);
    } else {
        // Allow time for a graceful exit if needed, though current tasks aren't tracked
        setTimeout(() => {
            log(LOG_PREFIXES.shutdown, 'Exiting gracefully.');
            process.exit(0);
        }, 2000);
    }
}

function main() {
    log(LOG_PREFIXES.startup, 'Starting executor...');

    process.on('SIGTERM', () => shutdown());
    process.on('SIGINT', () => shutdown());

    if (!config.isExecutorEnabled) {
        log(LOG_PREFIXES.startup, "[EXECUTOR_IDLE_GUARD]");
        return;
    }

    if (!config.hasSupabaseEnv) {
        log(LOG_PREFIXES.guard, 'FATAL: Missing Supabase environment variables. Exiting.');
        process.exit(1);
    }

    try {
        supabase = createClient(config.supabaseUrl, config.supabaseServiceRoleKey);
        log(LOG_PREFIXES.startup, 'Supabase client initialized successfully.');
    } catch (error) {
        log(LOG_PREFIXES.guard, `FATAL: Could not initialize Supabase client: ${error.message}. Check SUPABASE_URL.`);
        process.exit(1);
    }

    log(LOG_PREFIXES.startup, `Configuration valid. Polling every ${config.pollInterval}ms.`);
    log(LOG_PREFIXES.startup, `Allowed actions: [${config.allowedActions.join(', ')}]`);
    log(LOG_PREFIXES.startup, `Task timeout set to ${config.taskTimeout}ms.`);
    log(LOG_PREFIXES.startup, `Assigning tasks to: ${config.executorId}`);

    startPollingIfNeeded();

    log(LOG_PREFIXES.startup, '[EXECUTOR_START] Executor running.');
}

// =================================================================
// HELPER FUNCTIONS (from original file)
// =================================================================
function generateDummyRows(projectType) {
  const baseRows = [
    { fase: 'voorbereiding', stabu_code: '1001', omschrijving: 'Voorbereiding werk', hoeveelheid: 1, inkoop: 1000 },
    { fase: 'ruwbouw', stabu_code: '2001', omschrijving: 'Fundering', hoeveelheid: 10, inkoop: 5000 },
    { fase: 'afbouw', stabu_code: '3001', omschrijving: 'Vloeren', hoeveelheid: 50, inkoop: 2000 },
  ];
  return baseRows;
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
    return new Promise((resolve) => {
        const doc = new PDFDocument({ margin: 50 });
        const buffers = [];
        doc.on('data', buffers.push.bind(buffers));
        doc.on('end', () => resolve(Buffer.concat(buffers)));

        // PDF Content
        doc.fontSize(20).text('2JOURS Calculatie Rapport', { align: 'center' });
        doc.moveDown(2);
        doc.fontSize(14).text(`Project: ${run.scenario_name || run.project_id}`);
        doc.text(`Type: ${run.calculation_type}`);
        doc.text(`Datum: ${new Date().toLocaleDateString()}`);
        doc.addPage();

        const grouped = rows.reduce((acc, row) => {
            acc[row.fase] = acc[row.fase] || [];
            acc[row.fase].push(row);
            return acc;
        }, {});

        Object.entries(grouped).forEach(([fase, faseRows]) => {
            doc.fontSize(16).text(fase.toUpperCase(), { underline: true });
            doc.moveDown();
            // Complex table generation omitted for brevity, assuming simple text output is sufficient
            faseRows.forEach(row => {
                doc.fontSize(10).text(`${row.omschrijving} - €${row.regel_totaal.toFixed(2)}`);
            });
            doc.moveDown();
        });

        doc.moveDown();
        doc.fontSize(14).text(`Eindtotaal: €${totalAmount.toFixed(2)}`, { align: 'right' });
        doc.end();
    });
}

// Entry point
main();

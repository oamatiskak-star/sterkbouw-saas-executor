
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function updateTaskStatus(taskId, status, error = null) {
  const update = {
    status,
    finished_at: new Date().toISOString(),
  };
  if (error) {
    update.error = typeof error === 'string' ? error : error.message;
  }
  await supabase.from('executor_tasks').update(update).eq('id', taskId);
}

export async function handleProjectScan(task) {
  const { id: taskId, project_id, calculation_run_id } = task;

  // Dynamically import pdf-parse
  let pdf;
  try {
    const pdfModule = await import('pdf-parse');
    pdf = pdfModule.default;
  } catch (err) {
    console.error('[Critical] Failed to load pdf-parse module.', err);
    await updateTaskStatus(taskId, 'failed', "CRITICAL_DEPENDENCY_MISSING: The 'pdf-parse' package is not installed. Please run 'npm install pdf-parse'.");
    return;
  }

  if (!project_id) {
    await updateTaskStatus(taskId, 'failed', 'Project ID is missing');
    return;
  }

  try {
    // 1. Update status to indicate scanning is in progress
    await supabase
      .from('executor_tasks')
      .update({ status: 'running', started_at: new Date().toISOString() })
      .eq('id', taskId);
    
    if (calculation_run_id) {
        await supabase
          .from('calculation_runs')
          .update({ status: 'scanning', current_step: 'Documentenscan', updated_at: new Date().toISOString() })
          .eq('id', calculation_run_id);
    }

    console.log(`[handleProjectScan] Scan start for project ${project_id}`);

    // 2. List documenten in Supabase Storage (sterkcalc)
    const { data: objects, error: listError } = await supabase.storage
      .from('sterkcalc')
      .list(project_id, { limit: 1000, offset: 0, sortBy: { column: 'name', order: 'asc' }, recursive: true });

    if (listError || !objects || objects.length === 0) {
      throw new Error(listError?.message || 'No documents found in storage.');
    }

    const documentTypes = objects
      .map((obj) => String(obj.name || '').split('.').pop())
      .filter(Boolean);
    console.log(`[handleProjectScan] Document count: ${objects.length}`);
    console.log(`[handleProjectScan] Document types: ${documentTypes.join(', ') || 'unknown'}`);

    const document = objects[0];
    const storagePath = `${project_id}/${document.name}`;

    // 3. Download the document from Supabase Storage
    const { data: fileBlob, error: downloadError } = await supabase.storage
      .from('sterkcalc')
      .download(storagePath);

    if (downloadError) {
      throw new Error(`Failed to download document: ${downloadError.message}`);
    }

    // 4. Parse the document (assuming PDF for now)
    const fileBuffer = await fileBlob.arrayBuffer();
    const pdfData = await pdf(Buffer.from(fileBuffer));

    // 5. Placeholder for STABU mapping logic
    // In the future, this text will be analyzed to find construction elements.
    console.log(`--- Extracted Text for Project ${project_id} ---`);
    console.log(pdfData.text.substring(0, 2000) + '...'); // Log first 2000 chars
    console.log(`------------------------------------------------`);
    
    // Here you would insert the logic to map text to stabu_project_posten
    // For example:
    // const elements = await mapTextToStabu(pdfData.text);
    // await supabase.from('stabu_project_posten').insert(elements);

    // 6. Mark task as completed
    await updateTaskStatus(taskId, 'completed');
    
    if (calculation_run_id) {
        await supabase
          .from('calculation_runs')
          .update({ status: 'scan_completed', current_step: 'Wachten op calculatie', updated_at: new Date().toISOString() })
          .eq('id', calculation_run_id);
    }

  } catch (err) {
    console.error(`[handleProjectScan] Error processing task ${taskId}:`, err);
    await updateTaskStatus(taskId, 'failed', err);
    if (calculation_run_id) {
      await supabase
        .from('calculation_runs')
        .update({ status: 'failed', error: err.message, updated_at: new Date().toISOString() })
        .eq('id', calculation_run_id);
    }
  }
}

// executor/config.js
import dotenv from "dotenv";
dotenv.config();

const LOG_PREFIX = '[EXECUTOR_CONFIG]';

// A. CORE EXECUTOR SETTINGS
// =================================================================

// Global switch for the entire executor polling loop. If false, the loop will not start.
// Must be explicitly set to "true" to run.
const isExecutorEnabled = process.env.EXECUTOR_ENABLED === 'true';

// Polling interval in milliseconds.
const pollInterval = parseInt(process.env.POLL_INTERVAL_MS, 10) || 3000;

// Hard minimum for polling interval to prevent runaway polling.
const minPollInterval = 2000;

// Hard timeout for any single task execution.
const taskTimeout = parseInt(process.env.TASK_TIMEOUT_MS, 10) || 120000; // 2 minutes

const effectivePollInterval = Math.max(pollInterval, minPollInterval);

if (pollInterval < minPollInterval) {
    console.warn(`${LOG_PREFIX} Warning: POLL_INTERVAL_MS (${pollInterval}ms) is below the minimum (${minPollInterval}ms). Using minimum value.`);
}

// B. TASK & ACTION WHITELIST
// =================================================================

// Defines which actions this executor is allowed to run.
// This is a hard guard. Actions not on this list will not be picked up.
const allowedActions = [
    'system_repair_full_chain',
    'system_repair_full',
    'repair_full_system',
    'system_full_scan',
    'upload',
    'upload_files',
    'project_scan',
    'analysis',
    'generate_stabu',
    'start_rekenwolk',
    'start_calculation',
    'generate_risk_report',
    'planning',
    'finalize_rekenwolk',
    'rapportage',
];

export const executorConfig = {
    isExecutorEnabled,
    pollInterval: effectivePollInterval,
    taskTimeout,
    allowedActions,
};

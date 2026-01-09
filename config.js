require('dotenv').config();

const LOG_PREFIX = '[EXECUTOR_CONFIG]';

// A. CORE EXECUTOR SETTINGS
// =================================================================

// Global switch for the entire executor. If false, the process will exit immediately.
// Must be explicitly set to "true" to run.
const EXECUTOR_ENABLED = process.env.EXECUTOR_ENABLED === 'true';

// Polling interval in milliseconds.
const POLL_INTERVAL_MS = parseInt(process.env.POLL_INTERVAL_MS, 10) || 5000;

// Hard minimum for polling interval to prevent runaway polling.
const MIN_POLL_INTERVAL_MS = 2000;

// Hard timeout for any single task execution.
const TASK_TIMEOUT_MS = parseInt(process.env.TASK_TIMEOUT_MS, 10) || 60000; // 1 minute

// The name of the worker as it should be identified in the database.
const EXECUTOR_ID = 'executor';

// B. TASK & ACTION WHITELIST
// =================================================================

// Defines which actions this executor is allowed to run.
// Based on the `calculation_type` column in `calculation_runs`.
const ALLOWED_ACTIONS = [
    'nieuwbouw',
    'transformatie',
    'renovatie',
    'uitbreiding',
    'verduurzaming',
];

// C. SUPABASE & EXTERNAL SERVICES
// =================================================================

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const HAS_SUPABASE_ENV = Boolean(SUPABASE_URL && SUPABASE_SERVICE_ROLE_KEY);

// D. VALIDATION & EXPORT
// =================================================================

const effectivePollInterval = Math.max(POLL_INTERVAL_MS, MIN_POLL_INTERVAL_MS);

if (POLL_INTERVAL_MS < MIN_POLL_INTERVAL_MS) {
    console.warn(`${LOG_PREFIX} Warning: POLL_INTERVAL_MS (${POLL_INTERVAL_MS}ms) is below the minimum (${MIN_POLL_INTERVAL_MS}ms). Using minimum value.`);
}

if (!HAS_SUPABASE_ENV) {
    console.error(`${LOG_PREFIX} Error: Missing required environment variables: SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.`);
}

module.exports = {
    // Flags
    isExecutorEnabled: EXECUTOR_ENABLED,
    hasSupabaseEnv: HAS_SUPABASE_ENV,

    // Timing
    pollInterval: effectivePollInterval,
    taskTimeout: TASK_TIMEOUT_MS,

    // Identification & Whitelists
    executorId: EXECUTOR_ID,
    allowedActions: ALLOWED_ACTIONS,

    // Supabase
    supabaseUrl: SUPABASE_URL,
    supabaseServiceRoleKey: SUPABASE_SERVICE_ROLE_KEY,

    // For validation at startup
    isConfigurationValid: EXECUTOR_ENABLED && HAS_SUPABASE_ENV,
};

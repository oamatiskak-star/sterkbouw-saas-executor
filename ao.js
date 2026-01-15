/*
 * ao.js — AO/SterkCalc Executor
 *
 * This file contains the main application logic for the SterkCalc executor service.
 * It runs a background polling mechanism to process asynchronous tasks from
 * the `executor_tasks` table.
 *
 * Architecture:
 * - Worker Only: No HTTP server or API routes are exposed.
 * - Polling Loop: Periodically queries the database for new tasks if the executor role is enabled.
 * - Task Processing: Each task is processed with guards for timeouts and errors.
 * - Configuration-driven: Behavior is controlled by environment variables, loaded via config files.
 * - Fail-safe: Multiple layers of try/catch and defensive checks are implemented to prevent crashes.
 */

import dotenv from "dotenv";
import { createClient } from "@supabase/supabase-js";

// Executor-specific logic and configuration
import { executorConfig } from "./executor/config.js";
import { runAction } from "./executor/actionRouter.js";


// ========================================
// ENVIRONMENT & CONFIGURATION
// ========================================

dotenv.config();

const AO_ROLE = process.env.AO_ROLE;
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const EXECUTOR_STATE_ID = "00000000-0000-0000-0000-000000000001";

function isExecutorEnabledFlag() {
    const envValue = process.env.EXECUTOR_ENABLED;
    if (typeof envValue === "string") {
        return envValue.trim().toLowerCase() === "true";
    }
    return executorConfig.isExecutorEnabled === true;
}

// Startup validation
if (!AO_ROLE) {
    console.error("[FATAL] Missing required environment variable: AO_ROLE. Exiting.");
    process.exit(1);
}
if (!SUPABASE_URL || !SUPABASE_KEY) {
    console.error("[FATAL] Missing Supabase environment variables (SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY). Exiting.");
    process.exit(1);
}


// ========================================
// INITIALIZATION
// ========================================

let supabase;
try {
    supabase = createClient(SUPABASE_URL, SUPABASE_KEY);
} catch (error) {
    console.error(`[FATAL] Could not initialize Supabase client: ${error.message}. Check credentials. Exiting.`);
    process.exit(1);
}


// ========================================
// EXECUTOR TASK PROCESSING
// ========================================

/**
 * Updates the status of a task in the database. Hardened to not throw exceptions.
 */
async function updateTaskStatus(taskId, status, errorMessage = null) {
    try {
        const updatePayload = {
            status,
            finished_at: new Date().toISOString(),
            ...(errorMessage && { error: errorMessage }),
        };
        const { error } = await supabase.from("executor_tasks").update(updatePayload).eq("id", taskId);
        if (error) {
            console.error(`[EXECUTOR_DB] Failed to update task ${taskId} to status ${status}: ${error.message}`);
        }
    } catch (err) {
        console.error(`[EXECUTOR_DB] CRITICAL: Network or unexpected error while updating status for task ${taskId}: ${err.message}`);
    }
}

/**
 * Wraps the action execution with timeout and error handling guards.
 * This function will not throw.
 */
async function runActionWithGuards(task) {
    console.log(`[TASK_PICKED] Processing task ${task.id}, action: ${task.action}`);

    const taskPromise = runAction(task);
    const timeoutPromise = new Promise((_, reject) =>
        setTimeout(() => reject(new Error(`Task timed out after ${executorConfig.taskTimeout / 1000}s`)), executorConfig.taskTimeout)
    );

    try {
        await Promise.race([taskPromise, timeoutPromise]);
        await updateTaskStatus(task.id, "completed");
        console.log(`[TASK_COMPLETED] Task ${task.id} finished successfully.`);
    } catch (error) {
        console.error(`[TASK_ABORTED] Task ${task.id} failed: ${error.message}`);
        await updateTaskStatus(task.id, "failed", error.message);
    }
}

/**
 * Polls for new tasks and hands them off for processing.
 */
async function pollExecutorTasks() {
    console.log("[POLL_CYCLE] Polling for an open task...");

    // 1. Find a potential task matching the configured whitelist
    const { data: task, error: queryError } = await supabase
        .from("executor_tasks")
        .select("*")
        .eq("status", "open")
        .eq("assigned_to", "executor")
        .in("action", executorConfig.allowedActions)
        .order("created_at", { ascending: true })
        .limit(1)
        .maybeSingle();

    if (queryError) {
        console.log("[POLLING_BLOCKED_GUARD]");
        stopPolling();
        return;
    }

    if (!task) {
        console.log("[POLL_CYCLE] No actionable tasks found.");
        return;
    }

    console.log(`[POLL_CYCLE] Found potential task ${task.id}. Attempting to lock...`);

    // 2. Atomically lock the task by updating its status.
    const { data: lockedTask, error: lockError } = await supabase
        .from("executor_tasks")
        .update({ status: "running", started_at: new Date().toISOString() })
        .eq("id", task.id)
        .eq("status", "open") // Critial condition to prevent race
        .select()
        .single(); // Expect one row back

    if (lockError || !lockedTask) {
        console.log(`[POLL_CYCLE] Failed to lock task ${task.id}. It was likely taken by another instance.`);
        return;
    }

    // 3. Process the task without blocking the polling loop.
    // Attach a catch() to the promise to prevent any possibility of an unhandled rejection.
    runActionWithGuards(lockedTask).catch(err => {
        console.error(`[CRITICAL] Unhandled exception escaped from runActionWithGuards for task ${lockedTask.id}: ${err.message}`);
    });
}


// ========================================
// SERVER STARTUP
// ========================================

// ========================================
// SERVER STARTUP & POLLING LOOP
// ========================================

let isShuttingDown = false;
let isPollingInFlight = false;
let isPollingActive = false;
let pollingTimer = null;

async function getExecutorAllowed() {
    try {
        const { data, error } = await supabase
            .from("executor_state")
            .select("allowed")
            .eq("id", EXECUTOR_STATE_ID)
            .maybeSingle();

        if (error || !data) {
            console.log("[POLLING_BLOCKED_GUARD]");
            return false;
        }

        return data.allowed === true;
    } catch {
        console.log("[POLLING_BLOCKED_GUARD]");
        return false;
    }
}

async function setExecutorAllowedFalse() {
    try {
        await supabase
            .from("executor_state")
            .update({ allowed: false, updated_at: new Date().toISOString() })
            .eq("id", EXECUTOR_STATE_ID);
    } catch {
        console.log("[POLLING_BLOCKED_GUARD]");
    }
}

async function hasActiveTasks() {
    try {
        const { data, error } = await supabase
            .from("executor_tasks")
            .select("id")
            .eq("assigned_to", "executor")
            .in("status", ["open", "running"])
            .limit(1)
            .maybeSingle();

        if (error) {
            stopPolling();
            console.log("[POLLING_BLOCKED_GUARD]");
            return null;
        }

        return Boolean(data);
    } catch {
        stopPolling();
        console.log("[POLLING_BLOCKED_GUARD]");
        return null;
    }
}

function stopPolling() {
    if (pollingTimer) {
        clearTimeout(pollingTimer);
        pollingTimer = null;
    }
    isPollingActive = false;
}

async function startPollingIfNeeded() {
    if (isShuttingDown || isPollingActive) {
        return;
    }
    if (!isExecutorEnabledFlag()) {
        console.log("[EXECUTOR_IDLE_GUARD]");
        return;
    }
    const isAllowed = await getExecutorAllowed();
    if (!isAllowed) {
        console.log("[EXECUTOR_IDLE_GUARD]");
        return;
    }
    const hasTasks = await hasActiveTasks();
    if (!hasTasks) {
        console.log("[EXECUTOR_IDLE_GUARD]");
        return;
    }
    isPollingActive = true;
    console.log("[EXECUTOR_TRIGGERED_BY_TASK]");
    console.log("[POLLING_STARTED]");
    pollingLoop();
}

// A recursive setTimeout loop is more robust than setInterval for async operations,
// as it guarantees that one poll finishes before the next one is scheduled, preventing overlap.
const pollingLoop = async () => {
    if (isShuttingDown) {
        console.log("[POLLER] Loop stopping due to shutdown signal.");
        return;
    }
    if (!isExecutorEnabledFlag() || !isPollingActive) {
        console.log("[EXECUTOR_IDLE_GUARD]");
        stopPolling();
        return;
    }
    const isAllowed = await getExecutorAllowed();
    if (!isAllowed) {
        console.log("[POLLING_BLOCKED_GUARD]");
        stopPolling();
        return;
    }
    if (isPollingInFlight) {
        console.log("[POLLING_BLOCKED_GUARD]");
        return;
    }
    isPollingInFlight = true;
    try {
        await pollExecutorTasks();
    } catch (err) {
        console.log("[POLLING_BLOCKED_GUARD]");
        stopPolling();
    } finally {
        isPollingInFlight = false;
        const hasTasks = await hasActiveTasks();
        if (hasTasks === null) {
            return;
        }
        if (!hasTasks) {
            await setExecutorAllowedFalse();
            console.log("[EXECUTOR_CHAIN_COMPLETE]");
            console.log("[POLLING_STOPPED_IDLE]");
            stopPolling();
            return;
        }
        if (!isShuttingDown && isExecutorEnabledFlag() && isPollingActive) {
            pollingTimer = setTimeout(pollingLoop, executorConfig.pollInterval);
        }
    }
};

console.log(`✅ AO Service is live with role: ${AO_ROLE}`);

const isExecutorRole = AO_ROLE === "EXECUTOR" || AO_ROLE === "AO_EXECUTOR";

if (isExecutorRole && isExecutorEnabledFlag()) {
    console.log(`[EXECUTOR_START] Executor enabled. Checking for active tasks...`);
    console.log(`[EXECUTOR_START] Poll interval: ${executorConfig.pollInterval}ms | Task timeout: ${executorConfig.taskTimeout}ms`);
    console.log(`[EXECUTOR_START] Allowed actions: ${executorConfig.allowedActions.join(', ')}`);
    startPollingIfNeeded();
} else if (isExecutorRole && !executorConfig.isExecutorEnabled) {
    console.log("[EXECUTOR_IDLE_GUARD]");
} else {
    console.log("[EXECUTOR_IDLE_GUARD]");
}

// Handle graceful shutdown by setting a flag that the polling loop checks.
const shutdown = () => {
    if (isShuttingDown) return;
    console.log("[SHUTDOWN] Signal received. The polling loop will stop after the current cycle.");
    isShuttingDown = true;
    stopPolling();

    // Allow time for any in-flight request to complete before exiting.
    setTimeout(() => {
        console.log("[SHUTDOWN] Exiting process.");
        process.exit(0);
    }, executorConfig.pollInterval + 1000); // Wait for one poll interval + a buffer
};

process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);

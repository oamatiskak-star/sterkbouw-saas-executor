/*
 * ao.js — AO/SterkCalc Executor
 *
 * This file contains the main application logic for the SterkCalc executor service.
 * It combines an Express web server for API endpoints with a background polling
 * mechanism to process asynchronous tasks from the `executor_tasks` table.
 *
 * Architecture:
 * - Express Server: Handles HTTP requests for health checks, webhooks, and API calls.
 * - Polling Loop: Periodically queries the database for new tasks if the executor role is enabled.
 * - Task Processing: Each task is processed with guards for timeouts and errors.
 * - Configuration-driven: Behavior is controlled by environment variables, loaded via config files.
 * - Fail-safe: Multiple layers of try/catch and defensive checks are implemented to prevent crashes.
 */

import express from "express";
import dotenv from "dotenv";
import { createClient } from "@supabase/supabase-js";

// Executor-specific logic and configuration
import { executorConfig } from "./executor/config.js";
import { runAction } from "./executor/actionRouter.js";

// API Routers and integration handlers
import { handleTelegramWebhook } from "./integrations/telegramWebhook.js";
import uploadTaskRouter from "./api/executor/upload-task.js";
import startCalculationRouter from "./api/executor/start-calculation.js";
import aiDrawingRouter from "./api/ai/generate-drawing.js";
import renderProcessRouter from "./api/executor/render-process.js";
import aiProcessingRouter from "./api/executor/ai-processing.js";
import aiEngineRouter from "./api/executor/ai-engine.js";


// ========================================
// ENVIRONMENT & CONFIGURATION
// ========================================

dotenv.config();

const AO_ROLE = process.env.AO_ROLE;
const PORT = process.env.PORT || 3000;
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

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

const app = express();
let supabase;
try {
    supabase = createClient(SUPABASE_URL, SUPABASE_KEY);
} catch (error) {
    console.error(`[FATAL] Could not initialize Supabase client: ${error.message}. Check credentials. Exiting.`);
    process.exit(1);
}

// ========================================
// MIDDLEWARE
// ========================================

// Looser CORS for development, should be tightened in production
app.use((req, res, next) => {
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Methods", "GET,POST,PUT,DELETE,OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type,Authorization");
    if (req.method === "OPTIONS") return res.sendStatus(200);
    next();
});

app.use(express.json({ limit: "50mb" }));
app.use((req, _res, next) => {
    console.log(`[HTTP] ${req.method} ${req.path}`);
    next();
});

// ========================================
// CORE API ROUTES
// ========================================

app.get("/", (_req, res) => res.json({ ok: true, message: "AO Executor is running." }));
app.get("/health", (_req, res) => res.status(200).json({ status: "ok", role: AO_ROLE, timestamp: new Date().toISOString() }));
app.post("/telegram/webhook", handleTelegramWebhook);

// Executor-specific API routes
app.use("/api/executor/upload-task", uploadTaskRouter);
app.use("/api/ai/generate-drawing", aiDrawingRouter);
app.use("/api/executor/render-process", renderProcessRouter);
app.use("/api/executor/ai-processing", aiProcessingRouter);
app.use("/api/executor/ai-engine", aiEngineRouter);
app.use("/api/executor/start-calculation", startCalculationRouter);


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
        console.error(`[POLL_GUARD_BLOCK] Database query failed: ${queryError.message}.`);
        // We do not exit, allowing the poller to try again.
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

app.listen(PORT, "0.0.0.0", () => {
    console.log(`✅ AO Service is live on port ${PORT} with role: ${AO_ROLE}`);

    const isExecutorRole = AO_ROLE === "EXECUTOR" || AO_ROLE === "AO_EXECUTOR";

    if (isExecutorRole && executorConfig.isExecutorEnabled) {
        console.log(`[EXECUTOR_START] Executor enabled and starting. Polling every ${executorConfig.pollInterval}ms.`);
        console.log(`[EXECUTOR_START] Allowed actions: ${executorConfig.allowedActions.join(', ')}`);
        setInterval(pollExecutorTasks, executorConfig.pollInterval);
    } else if (isExecutorRole && !executorConfig.isExecutorEnabled) {
        console.log("[EXECUTOR_START] Executor role is active, but EXECUTOR_ENABLED is false. Polling will NOT start.");
    } else {
        console.log("[EXECUTOR_START] Role is not EXECUTOR. Polling loop will not start.");
    }
});

// Handle graceful shutdown
const shutdown = () => {
    console.log("[SHUTDOWN] Signal received. Shutting down gracefully.");
    // No need to clear interval, process will exit.
    process.exit(0);
};

process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);

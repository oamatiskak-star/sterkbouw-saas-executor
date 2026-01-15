/*
 * ao.js — AO/SterkCalc Executor
 */

import dotenv from "dotenv";
import { createClient } from "@supabase/supabase-js";

import { executorConfig } from "./executor/config.js";
import { runAction } from "./executor/actionRouter.js";

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

if (!AO_ROLE) process.exit(1);
if (!SUPABASE_URL || !SUPABASE_KEY) process.exit(1);

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

// ================= EXECUTOR STATE =================

async function ensureExecutorAllowedAtStartup() {
    try {
        await supabase
            .from("executor_state")
            .update({
                allowed: true,
                updated_at: new Date().toISOString(),
            })
            .eq("id", EXECUTOR_STATE_ID);
    } catch {
        process.exit(1);
    }
}

// ================= TASK EXECUTION =================

async function updateTaskStatus(taskId, status, errorMessage = null) {
    try {
        const payload = {
            status,
            finished_at: new Date().toISOString(),
            ...(errorMessage && { error: errorMessage }),
        };
        await supabase.from("executor_tasks").update(payload).eq("id", taskId);
    } catch {}
}

async function runActionWithGuards(task) {
    try {
        await Promise.race([
            runAction(task),
            new Promise((_, r) =>
                setTimeout(() => r(new Error("timeout")), executorConfig.taskTimeout)
            ),
        ]);
        await updateTaskStatus(task.id, "completed");
    } catch (e) {
        await updateTaskStatus(task.id, "failed", e.message);
    }
}

async function pollExecutorTasks() {
    const { data: task } = await supabase
        .from("executor_tasks")
        .select("*")
        .eq("status", "open")
        .eq("assigned_to", "executor")
        .in("action", executorConfig.allowedActions)
        .order("created_at", { ascending: true })
        .limit(1)
        .maybeSingle();

    if (!task) return;

    const { data: locked } = await supabase
        .from("executor_tasks")
        .update({ status: "running", started_at: new Date().toISOString() })
        .eq("id", task.id)
        .eq("status", "open")
        .select()
        .single();

    if (locked) runActionWithGuards(locked).catch(() => {});
}

// ================= POLLING =================

let isPollingActive = false;
let pollingTimer = null;
let isPollingInFlight = false;

async function getExecutorAllowed() {
    const { data } = await supabase
        .from("executor_state")
        .select("allowed")
        .eq("id", EXECUTOR_STATE_ID)
        .maybeSingle();
    return data?.allowed === true;
}

function stopPolling() {
    if (pollingTimer) clearTimeout(pollingTimer);
    pollingTimer = null;
    isPollingActive = false;
}

async function startPollingIfNeeded() {
    if (!isExecutorEnabledFlag() || isPollingActive) return;

    isPollingActive = true;
    pollingLoop();
}

const pollingLoop = async () => {
    if (!isExecutorEnabledFlag() || !isPollingActive) {
        stopPolling();
        return;
    }

    const allowed = await getExecutorAllowed();
    if (!allowed) {
        stopPolling();
        return;
    }

    if (isPollingInFlight) return;
    isPollingInFlight = true;

    try {
        await pollExecutorTasks();
    } finally {
        isPollingInFlight = false;
        pollingTimer = setTimeout(pollingLoop, executorConfig.pollInterval);
    }
};

// ================= STARTUP =================

console.log(`AO Executor live | role=${AO_ROLE}`);

if ((AO_ROLE === "EXECUTOR" || AO_ROLE === "AO_EXECUTOR") && isExecutorEnabledFlag()) {
    await ensureExecutorAllowedAtStartup();
    startPollingIfNeeded();
}

process.on("SIGTERM", stopPolling);
process.on("SIGINT", stopPolling);

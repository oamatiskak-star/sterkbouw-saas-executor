/*
 * ao.js — AO/SterkCalc Executor (FIXED POLLING ENGINE)
 */

import dotenv from "dotenv";
import { createClient } from "@supabase/supabase-js";

import { executorConfig } from "./executor/config.js";
import { runAction } from "./executor/actionRouter.js";

dotenv.config();

const AO_ROLE = process.env.AO_ROLE;
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

function isExecutorEnabledFlag() {
    return process.env.EXECUTOR_ENABLED === "true";
}

if (!AO_ROLE) process.exit(1);
if (!SUPABASE_URL || !SUPABASE_KEY) process.exit(1);

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

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

    if (locked) {
        runActionWithGuards(locked).catch(() => {});
    }
}

// ================= POLLING LOOP =================

let pollingTimer = null;
let isPollingInFlight = false;

async function pollingLoop() {
    if (!isExecutorEnabledFlag()) return;

    if (isPollingInFlight) return;
    isPollingInFlight = true;

    try {
        await pollExecutorTasks();
    } finally {
        isPollingInFlight = false;
        pollingTimer = setTimeout(pollingLoop, executorConfig.pollInterval);
    }
}

// ================= STARTUP =================

console.log(`AO Executor live | role=${AO_ROLE}`);

if ((AO_ROLE === "EXECUTOR" || AO_ROLE === "AO_EXECUTOR") && isExecutorEnabledFlag()) {
    console.log("[POLLING_STARTED]");
    pollingTimer = setTimeout(pollingLoop, 0);
}

process.on("SIGTERM", () => {
    if (pollingTimer) clearTimeout(pollingTimer);
    process.exit(0);
});

process.on("SIGINT", () => {
    if (pollingTimer) clearTimeout(pollingTimer);
    process.exit(0);
});

/**
 * ao.js — STABIEL, GEFIXT
 * Portal-services worden ALLEEN gestart indien expliciet ingeschakeld.
 * Executor kan nooit meer crashen door ontbrekende portal-config.
 */

import "./monteur/scan.js";
import express from "express";
import dotenv from "dotenv";
import { createClient } from "@supabase/supabase-js";

import { runAction } from "./executor/actionRouter.js";
import { handleTelegramWebhook } from "./integrations/telegramWebhook.js";
import { sendTelegram } from "./integrations/telegramSender.js";

import uploadTaskRouter from "./api/executor/upload-task.js";
import aiDrawingRouter from "./api/ai/generate-drawing.js";
import renderProcessRouter from "./api/executor/render-process.js";
import aiProcessingRouter from "./api/executor/ai-processing.js";
import aiEngineRouter from "./api/executor/ai-engine.js";

/*
========================
OPTIONELE PORTAAL IMPORTS
Worden pas gebruikt als PORTAL_ENABLED=true
========================
*/
let PortalSyncTask,
  QuoteProcessor,
  RealtimeSyncService,
  portalConfig,
  validateConfig;

/*
========================
ENV
========================
*/
dotenv.config();

/*
========================
CONFIG
========================
*/
const AO_ROLE = process.env.AO_ROLE;
const PORT = process.env.PORT || 3000;
const AI_ENGINE_URL = "http://localhost:8000";
const PORTAL_ENABLED = process.env.PORTAL_ENABLED === "true";

if (!AO_ROLE) throw new Error("env_missing_ao_role");
if (!process.env.SUPABASE_URL) throw new Error("env_missing_supabase_url");
if (!process.env.SUPABASE_SERVICE_ROLE_KEY)
  throw new Error("env_missing_supabase_service_role_key");

/*
========================
APP INIT
========================
*/
const app = express();

/*
========================
CORS
========================
*/
app.use((req, res, next) => {
  res.setHeader(
    "Access-Control-Allow-Origin",
    "https://sterkbouw-saas-front-production.up.railway.app"
  );
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,PUT,DELETE,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type,Authorization");
  res.setHeader("Access-Control-Allow-Credentials", "true");

  if (req.method === "OPTIONS") return res.sendStatus(200);
  next();
});

app.use(express.json({ limit: "50mb" }));

app.use((req, _res, next) => {
  console.log("INCOMING_REQUEST", req.method, req.path);
  next();
});

/*
========================
SUPABASE
========================
*/
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

/*
========================
BASIC ROUTES
========================
*/
app.get("/", (_req, res) => res.json({ ok: true }));
app.get("/ping", (_req, res) => res.json({ ok: true, role: AO_ROLE }));

/*
========================
AI ENGINE HEALTH
========================
*/
app.get("/ai-health", async (_req, res) => {
  try {
    const axios = (await import("axios")).default;
    const response = await axios.get(`${AI_ENGINE_URL}/health`, {
      timeout: 5000,
    });

    res.json({
      ok: true,
      ao_executor: { status: "online", role: AO_ROLE, port: PORT },
      ai_engine: { status: "online", version: response.data.version },
    });
  } catch (error) {
    res.json({
      ok: true,
      ao_executor: { status: "online", role: AO_ROLE, port: PORT },
      ai_engine: { status: "offline", error: error.message },
    });
  }
});

/*
========================
TELEGRAM
========================
*/
app.post("/telegram/webhook", async (req, res) => {
  try {
    await handleTelegramWebhook(req.body);
  } catch (e) {
    console.error("telegram_webhook_error", e?.message || e);
  }
  res.json({ ok: true });
});

/*
========================
API ROUTES — EXECUTOR
========================
*/
app.use("/api/executor/upload-task", uploadTaskRouter);
app.use("/api/ai/generate-drawing", aiDrawingRouter);
app.use("/api/executor/render-process", renderProcessRouter);
app.use("/api/executor/ai-processing", aiProcessingRouter);
app.use("/api/executor/ai-engine", aiEngineRouter);

/*
========================
EXECUTOR LOOP
========================
*/
async function pollExecutorTasks() {
  const { data: tasks } = await supabase
    .from("executor_tasks")
    .select("*")
    .eq("status", "open")
    .eq("assigned_to", "executor")
    .order("created_at", { ascending: true })
    .limit(1);

  if (!tasks || !tasks.length) return;

  const task = tasks[0];
  console.log("EXECUTOR_TASK_PICKED", task.action, task.id);

  try {
    await supabase
      .from("executor_tasks")
      .update({ status: "running", started_at: new Date().toISOString() })
      .eq("id", task.id);

    await runAction(task);

    await supabase
      .from("executor_tasks")
      .update({ status: "completed", finished_at: new Date().toISOString() })
      .eq("id", task.id);
  } catch (e) {
    const errorMsg =
      e?.message ||
      e?.error ||
      (typeof e === "string" ? e : JSON.stringify(e));

    console.error("executor_task_error", errorMsg);

    await supabase
      .from("executor_tasks")
      .update({
        status: "failed",
        error: errorMsg,
        finished_at: new Date().toISOString(),
      })
      .eq("id", task.id);
  }
}

/*
========================
PORTAAL SERVICES (VEILIG)
========================
*/
async function initializePortalServicesSafe() {
  try {
    const portalImports = await import("./config/portalConfig.js");
    portalConfig = portalImports.portalConfig;
    validateConfig = portalImports.validateConfig;

    PortalSyncTask = (await import("./tasks/portalSync.js")).PortalSyncTask;
    QuoteProcessor = (await import("./tasks/quoteProcessor.js")).QuoteProcessor;
    RealtimeSyncService = (
      await import("./services/realtimeSync.js")
    ).RealtimeSyncService;

    validateConfig();

    const portalSync = new PortalSyncTask(portalConfig);
    await portalSync.start();

    console.log("✅ Portal services gestart");
  } catch (err) {
    console.error("❌ Portal services NIET gestart:", err.message);
  }
}

/*
========================
STARTUP
========================
*/
if (AO_ROLE === "EXECUTOR" || AO_ROLE === "AO_EXECUTOR") {
  setInterval(pollExecutorTasks, 3000);
}

app.listen(PORT, "0.0.0.0", async () => {
  console.log("AO EXECUTOR SERVICE LIVE", AO_ROLE, PORT);

  if (PORTAL_ENABLED === true) {
    console.log("ℹ️ Portal enabled → initialiseren");
    await initializePortalServicesSafe();
  } else {
    console.log("ℹ️ Portal disabled → executor-only modus");
  }
});

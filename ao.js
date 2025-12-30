import "./monteur/scan.js";
import express from "express";
import { createClient } from "@supabase/supabase-js";
import dotenv from "dotenv";

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
PORTAAL SERVICES
========================
*/
import { PortalSyncTask } from "./tasks/portalSync.js";
import { QuoteProcessor } from "./tasks/quoteProcessor.js";
import { RealtimeSyncService } from "./services/realtimeSync.js";
import { portalConfig, validateConfig } from "./config/portalConfig.js";

console.log("AO ENTRYPOINT ao.js LOADED");

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

  if (req.method === "OPTIONS") {
    return res.sendStatus(200);
  }
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
DEBUG
========================
*/
console.log("SUPABASE_URL =", process.env.SUPABASE_URL);
console.log(
  "SERVICE_ROLE_KEY_PREFIX =",
  process.env.SUPABASE_SERVICE_ROLE_KEY.slice(0, 12)
);
console.log("AI_ENGINE_URL =", AI_ENGINE_URL);

/*
========================
PORTAAL SERVICES INIT
========================
*/
let portalSync;
let quoteProcessor;
let realtimeSync;

async function initializePortalServices() {
  validateConfig();

  portalSync = new PortalSyncTask(portalConfig);
  await portalSync.start();

  quoteProcessor = new QuoteProcessor(supabase);
  realtimeSync = new RealtimeSyncService(portalConfig);

  console.log("✅ Portaal services initialized");
}

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
      ao_executor: {
        status: "online",
        role: AO_ROLE,
        port: PORT,
      },
      ai_engine: {
        status: "online",
        version: response.data.version,
        url: AI_ENGINE_URL,
      },
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    res.json({
      ok: true,
      ao_executor: {
        status: "online",
        role: AO_ROLE,
        port: PORT,
      },
      ai_engine: {
        status: "offline",
        error: error.message,
        url: AI_ENGINE_URL,
      },
      timestamp: new Date().toISOString(),
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
API ROUTES – EXECUTOR
========================
*/
app.use("/api/executor/upload-task", uploadTaskRouter);
app.use("/api/ai/generate-drawing", aiDrawingRouter);
app.use("/api/executor/render-process", renderProcessRouter);
app.use("/api/executor/ai-processing", aiProcessingRouter);
app.use("/api/executor/ai-engine", aiEngineRouter);

/*
========================
API ROUTES – PORTAAL
========================
*/
app.post("/api/portal/sync/:projectId", async (req, res) => {
  try {
    const { projectId } = req.params;
    const result = await portalSync.syncProjectToPortal(projectId);
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post("/api/portal/process-quote/:requestId", async (req, res) => {
  try {
    const { requestId } = req.params;
    const result = await quoteProcessor.processExtraWorkRequest(requestId);
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get("/api/portal/stats", (_req, res) => {
  res.json(realtimeSync.getStats());
});

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
      .update({
        status: "running",
        started_at: new Date().toISOString(),
      })
      .eq("id", task.id);

    await runAction(task);

    await supabase
      .from("executor_tasks")
      .update({
        status: "completed",
        finished_at: new Date().toISOString(),
      })
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
AI ENGINE MONITORING
========================
*/
async function checkAIEngineHealth() {
  try {
    const axios = (await import("axios")).default;
    const response = await axios.get(`${AI_ENGINE_URL}/health`, {
      timeout: 5000,
    });

    await supabase.from("system_health").upsert({
      service: "ai_engine",
      status: "online",
      last_check: new Date().toISOString(),
      details: response.data,
    });
  } catch (error) {
    await supabase.from("system_health").upsert({
      service: "ai_engine",
      status: "offline",
      last_check: new Date().toISOString(),
      details: { error: error.message },
    });
  }
}

if (AO_ROLE === "EXECUTOR" || AO_ROLE === "AO_EXECUTOR") {
  console.log("AO EXECUTOR STARTED");

  setInterval(pollExecutorTasks, 3000);
  setInterval(checkAIEngineHealth, 60000);
  setTimeout(checkAIEngineHealth, 5000);
}

/*
========================
SERVER
========================
*/
app.listen(PORT, "0.0.0.0", async () => {
  console.log("AO EXECUTOR SERVICE LIVE", AO_ROLE, PORT);
  await initializePortalServices();
});

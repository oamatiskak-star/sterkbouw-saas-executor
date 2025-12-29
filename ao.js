import "./monteur/scan.js";
import express from "express";
import { createClient } from "@supabase/supabase-js";

import { runAction } from "./executor/actionRouter.js";
import { handleTelegramWebhook } from "./integrations/telegramWebhook.js";
import { sendTelegram } from "./integrations/telegramSender.js";
import uploadTaskRouter from "./api/executor/upload-task.js";
import aiDrawingRouter from "./api/ai/generate-drawing.js";
import renderProcessRouter from "./api/executor/render-process.js";
import aiProcessingRouter from "./api/executor/ai-processing.js";
import aiEngineRouter from "./api/executor/ai-engine.js";

console.log("AO ENTRYPOINT ao.js LOADED");

/*
========================
CONFIG
========================
*/
const AO_ROLE = process.env.AO_ROLE;
const PORT = process.env.PORT || 3000;
// Gebruik localhost omdat AI Engine nu in dezelfde container draait
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
BASIC ROUTES
========================
*/
app.get("/", (_req, res) => res.json({ ok: true }));
app.get("/ping", (_req, res) => res.json({ ok: true, role: AO_ROLE }));

// AI Engine health check endpoint
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
API ROUTES - EXECUTOR FUNCTIONALITEIT
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

// AI Engine health monitoring
async function checkAIEngineHealth() {
  try {
    const axios = (await import("axios")).default;
    const response = await axios.get(`${AI_ENGINE_URL}/health`, {
      timeout: 5000,
    });

    console.log("✅ AI Engine status:", response.data.status);

    // Update database with health status
    await supabase.from("system_health").upsert({
      service: "ai_engine",
      status: "online",
      last_check: new Date().toISOString(),
      details: {
        version: response.data.version,
        uptime: response.data.uptime,
      },
    });
  } catch (error) {
    console.warn("⚠️ AI Engine unavailable:", error.message);

    await supabase.from("system_health").upsert({
      service: "ai_engine",
      status: "offline",
      last_check: new Date().toISOString(),
      details: {
        error: error.message,
      },
    });

    // Send Telegram notification only if it's been down for a while
    const { data: lastStatus } = await supabase
      .from("system_health")
      .select("last_check")
      .eq("service", "ai_engine")
      .eq("status", "online")
      .order("last_check", { ascending: false })
      .limit(1);

    if (lastStatus && lastStatus.length > 0) {
      const lastOnline = new Date(lastStatus[0].last_check);
      const now = new Date();
      const minutesDown = (now - lastOnline) / (1000 * 60);

      if (minutesDown > 5) {
        await sendTelegram(
          process.env.TELEGRAM_CHAT_ID,
          `⚠️ AI Engine Offline\n` +
            `Sinds: ${lastOnline.toLocaleString("nl-NL")}\n` +
            `Duur: ${Math.round(minutesDown)} minuten\n` +
            `Fout: ${error.message}`
        );
      }
    }
  }
}

if (AO_ROLE === "EXECUTOR" || AO_ROLE === "AO_EXECUTOR") {
  console.log("AO EXECUTOR STARTED");
  console.log("Nieuwe functionaliteiten geladen:");
  console.log("  - /api/executor/render-process");
  console.log("  - /api/executor/ai-processing");
  console.log("  - /api/executor/ai-engine");

  // Start executor task polling
  setInterval(pollExecutorTasks, 3000);

  // Start AI Engine health monitoring (every minute)
  setInterval(checkAIEngineHealth, 60000);

  // Initial health check
  setTimeout(checkAIEngineHealth, 5000);
}

/*
========================
SERVER
========================
*/
app.listen(PORT, "0.0.0.0", async () => {
  console.log("AO EXECUTOR SERVICE LIVE", AO_ROLE, PORT);
  console.log("Beschikbare functionaliteiten:");
  console.log("  - BIM Render & AI processing");
  console.log("  - Python AI Engine integratie");
  console.log("  - Document analyse & STABU calculaties");

  // Test AI Engine connection on startup
  setTimeout(async () => {
    try {
      const axios = (await import("axios")).default;
      const response = await axios.get(`${AI_ENGINE_URL}/health`, {
        timeout: 10000,
      });

      console.log("✅ AI Engine verbonden:", response.data.version);

      if (process.env.TELEGRAM_CHAT_ID) {
        await sendTelegram(
          process.env.TELEGRAM_CHAT_ID,
          `🚀 AO Executor Live\n` +
            `Role: ${AO_ROLE}\n` +
            `Port: ${PORT}\n` +
            `AI Engine: ✅ Online (v${response.data.version})`
        );
      }
    } catch (error) {
      console.warn("⚠️ AI Engine niet bereikbaar bij opstart:", error.message);

      if (process.env.TELEGRAM_CHAT_ID) {
        await sendTelegram(
          process.env.TELEGRAM_CHAT_ID,
          `🚀 AO Executor Live\n` +
            `Role: ${AO_ROLE}\n` +
            `Port: ${PORT}\n` +
            `AI Engine: ⚠️ Offline\n` +
            `Fout: ${error.message}`
        );
      }
    }
  }, 5000);
});

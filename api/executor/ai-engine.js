import express from "express";
import axios from "axios";
import FormData from "form-data";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { createClient } from "@supabase/supabase-js";

const router = express.Router();
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Config
const AI_ENGINE_URL = process.env.AI_ENGINE_URL || "http://localhost:8000";
const UPLOAD_DIR = path.join(__dirname, "../../../uploads");

// Ensure upload directory exists
if (!fs.existsSync(UPLOAD_DIR)) {
  fs.mkdirSync(UPLOAD_DIR, { recursive: true });
}

// Supabase client
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

/**
 * AI Engine Health Check
 */
router.get("/health", async (req, res) => {
  try {
    const response = await axios.get(`${AI_ENGINE_URL}/health`, {
      timeout: 5000,
    });

    res.json({
      success: true,
      ai_engine: response.data,
      executor: {
        status: "online",
        version: "2.0.0",
      },
    });
  } catch (error) {
    console.error("AI Engine health check failed:", error.message);
    res.status(503).json({
      success: false,
      error: "AI Engine unavailable",
      details: error.message,
    });
  }
});

/**
 * Document Analysis Endpoint
 * Accepts files and project data, forwards to AI Engine
 */
router.post("/analyze", async (req, res) => {
  try {
    const { project_id, files, project_context } = req.body;

    if (!project_id) {
      return res.status(400).json({
        success: false,
        error: "project_id is required",
      });
    }

    console.log("AI Analysis request received:", {
      project_id,
      file_count: files?.length || 0,
    });

    // Forward to Python AI Engine
    const aiResponse = await axios.post(
      `${AI_ENGINE_URL}/api/v1/analyze`,
      {
        file_paths: files,
        project_context: {
          project_id,
          project_type: project_context?.project_type || "new_build",
          existing_structure: project_context?.existing_structure || false,
          location: project_context?.location,
          special_requirements: project_context?.special_requirements || [],
        },
      },
      {
        timeout: 300000, // 5 minutes timeout
        headers: {
          "Content-Type": "application/json",
        },
      }
    );

    // Log task creation
    await supabase.from("ai_analysis_tasks").insert({
      task_id: aiResponse.data.task_id,
      project_id,
      status: "pending",
      file_count: files?.length || 0,
      created_at: new Date().toISOString(),
    });

    // Send notification
    await sendTelegramNotification(
      `🤖 AI Analyse gestart\n` +
        `Project: ${project_id}\n` +
        `Bestanden: ${files?.length || 0}\n` +
        `Task ID: ${aiResponse.data.task_id}`
    );

    res.json({
      success: true,
      task_id: aiResponse.data.task_id,
      status: aiResponse.data.status,
      message: "Document analysis started",
      estimated_time: aiResponse.data.estimated_time,
    });
  } catch (error) {
    console.error("AI Analysis error:", {
      error: error.message,
      response: error.response?.data,
      stack: error.stack,
    });

    // Send error notification
    await sendTelegramNotification(
      `❌ AI Analyse mislukt\n` +
        `Project: ${req.body?.project_id || "unknown"}\n` +
        `Fout: ${error.message}`
    );

    res.status(500).json({
      success: false,
      error: error.message,
      details: error.response?.data,
    });
  }
});

/**
 * Check Analysis Task Status
 */
router.get("/status/:task_id", async (req, res) => {
  try {
    const { task_id } = req.params;

    const response = await axios.get(
      `${AI_ENGINE_URL}/api/v1/tasks/${task_id}/status`
    );

    // Update database
    await supabase
      .from("ai_analysis_tasks")
      .update({
        status: response.data.status,
        progress: response.data.progress,
        updated_at: new Date().toISOString(),
      })
      .eq("task_id", task_id);

    res.json({
      success: true,
      task_id,
      status: response.data.status,
      progress: response.data.progress,
      result: response.data.result,
      error: response.data.error,
      updated_at: response.data.updated_at,
    });
  } catch (error) {
    console.error("AI Status check error:", error.message);
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

/**
 * File Upload to AI Engine
 */
router.post("/upload", async (req, res) => {
  try {
    const { file, project_id, file_type } = req.body;

    if (!file || !project_id) {
      return res.status(400).json({
        success: false,
        error: "File and project_id are required",
      });
    }

    // Decode base64 file
    const matches = file.match(/^data:([A-Za-z-+/]+);base64,(.+)$/);
    if (!matches || matches.length !== 3) {
      return res.status(400).json({
        success: false,
        error: "Invalid base64 format",
      });
    }

    const fileBuffer = Buffer.from(matches[2], "base64");
    const fileExt = matches[1].split("/")[1] || "bin";
    const fileName = `upload_${Date.now()}_${project_id}.${fileExt}`;
    const filePath = path.join(UPLOAD_DIR, fileName);

    // Save file temporarily
    fs.writeFileSync(filePath, fileBuffer);

    // Prepare form data
    const formData = new FormData();
    formData.append("file", fs.createReadStream(filePath));
    formData.append("project_id", project_id);
    formData.append("file_type", file_type || "document");

    // Send to AI Engine
    const aiResponse = await axios.post(
      `${AI_ENGINE_URL}/api/v1/upload`,
      formData,
      {
        headers: formData.getHeaders(),
        timeout: 120000, // 2 minutes
      }
    );

    // Cleanup temp file
    fs.unlinkSync(filePath);

    // Store file metadata in database
    await supabase.from("project_files").insert({
      project_id,
      file_name: fileName,
      storage_path: aiResponse.data.file_id,
      file_type: file_type || "document",
      file_size: fileBuffer.length,
      uploaded_at: new Date().toISOString(),
    });

    res.json({
      success: true,
      file_id: aiResponse.data.file_id,
      file_name: fileName,
      download_url: aiResponse.data.download_url,
      message: "File uploaded successfully",
    });
  } catch (error) {
    console.error("File upload error:", error.message);
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

/**
 * Generate Feasibility Report
 */
router.post("/feasibility", async (req, res) => {
  try {
    const { project_id, analysis_results } = req.body;

    const response = await axios.post(
      `${AI_ENGINE_URL}/api/v1/feasibility`,
      {
        project_id,
        analysis_results,
      },
      {
        timeout: 180000, // 3 minutes
      }
    );

    // Store report in database
    await supabase.from("project_reports").insert({
      project_id,
      report_type: "feasibility",
      report_data: response.data.report,
      generated_at: new Date().toISOString(),
      download_url: response.data.download_url,
    });

    // Send notification
    await sendTelegramNotification(
      `📊 Haalbaarheidsrapport gegenereerd\n` +
        `Project: ${project_id}\n` +
        `Beschikbaar in portaal`
    );

    res.json({
      success: true,
      report_type: "feasibility",
      report: response.data.report,
      download_url: response.data.download_url,
    });
  } catch (error) {
    console.error("Feasibility report error:", error.message);
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

/**
 * Generate Savings Report
 */
router.post("/savings", async (req, res) => {
  try {
    const { project_id, calculation_id } = req.body;

    const response = await axios.post(
      `${AI_ENGINE_URL}/api/v1/savings`,
      {
        project_id,
        calculation_id,
      },
      {
        timeout: 180000,
      }
    );

    // Store report
    await supabase.from("project_reports").insert({
      project_id,
      report_type: "savings",
      report_data: response.data.report,
      generated_at: new Date().toISOString(),
      download_url: response.data.download_url,
    });

    // Send notification
    await sendTelegramNotification(
      `💰 Besparingsrapport gegenereerd\n` +
        `Project: ${project_id}\n` +
        `Potentiële besparing: €${response.data.report?.total_savings || "N/A"}`
    );

    res.json({
      success: true,
      report_type: "savings",
      report: response.data.report,
      download_url: response.data.download_url,
    });
  } catch (error) {
    console.error("Savings report error:", error.message);
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

/**
 * Get STABU Prices
 */
router.get("/stabu/prices/:category", async (req, res) => {
  try {
    const { category } = req.params;

    const response = await axios.get(
      `${AI_ENGINE_URL}/api/v1/stabu/prices/${category}`
    );

    res.json({
      success: true,
      category,
      prices: response.data.prices,
      count: response.data.count,
    });
  } catch (error) {
    console.error("STABU prices error:", error.message);
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

/**
 * Search STABU Prices
 */
router.post("/stabu/search", async (req, res) => {
  try {
    const { search_term, limit } = req.body;

    const response = await axios.post(
      `${AI_ENGINE_URL}/api/v1/stabu/search`,
      {
        search_term,
        limit: limit || 20,
      }
    );

    res.json({
      success: true,
      search_term,
      results: response.data.results,
      count: response.data.count,
    });
  } catch (error) {
    console.error("STABU search error:", error.message);
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

/**
 * Get Project Calculations
 */
router.get("/calculations/:project_id", async (req, res) => {
  try {
    const { project_id } = req.params;

    const response = await axios.get(
      `${AI_ENGINE_URL}/api/v1/calculations/${project_id}`
    );

    res.json({
      success: true,
      project_id,
      calculations: response.data.calculations,
      total_calculations: response.data.total_calculations,
      latest_calculation: response.data.latest_calculation,
    });
  } catch (error) {
    console.error("Get calculations error:", error.message);
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

/**
 * Test AI Engine Connection
 */
router.get("/test", async (req, res) => {
  try {
    // Test connection to AI Engine
    const healthResponse = await axios.get(`${AI_ENGINE_URL}/health`, {
      timeout: 5000,
    });

    // Test STABU prices endpoint
    const stabuResponse = await axios.get(
      `${AI_ENGINE_URL}/api/v1/stabu/prices/betonwerk`,
      {
        timeout: 5000,
      }
    );

    res.json({
      success: true,
      ai_engine: {
        status: "online",
        version: healthResponse.data.version,
        response_time: Date.now() - (healthResponse.headers["x-request-time"] || Date.now()),
      },
      stabu_api: {
        status: "working",
        items_returned: stabuResponse.data.count,
      },
      endpoints_tested: ["/health", "/api/v1/stabu/prices/:category"],
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    res.status(503).json({
      success: false,
      error: "AI Engine test failed",
      details: error.message,
      timestamp: new Date().toISOString(),
    });
  }
});

/**
 * Helper function to send Telegram notifications
 */
async function sendTelegramNotification(message) {
  if (!process.env.TELEGRAM_CHAT_ID) {
    console.log("Telegram notification (simulated):", message);
    return;
  }

  try {
    // Use existing sendTelegram function from your imports
    const { sendTelegram } = await import("../integrations/telegramSender.js");
    await sendTelegram(process.env.TELEGRAM_CHAT_ID, message);
  } catch (error) {
    console.error("Telegram notification error:", error.message);
  }
}

export default router;

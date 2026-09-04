/**
 * SAMPLER V3.4 — LIGHTWEIGHT TEAM RELAY SERVER
 * Zero external dependencies. Uses standard Node.js built-in modules.
 * Powers the Shared Daily Sampling Session across multiple browsers/devices on the local team network.
 */

import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PORT = process.env.PORT || 3000;

// Volatile in-memory store of recent daily sessions (business-day sample cache, max 2 business days)
// Never written to disk or permanent store.
const recentDailySessions = new Map();
let sharedManifests = {};
let sharedReqIntel = {};
let sharedSampleIntelligence = {};

const MAX_SESSIONS = 2;

function evictOldSessions() {
  // Enforce retention of the last 2 distinct business sampling sessions (active + one prior session)
  if (recentDailySessions.size > MAX_SESSIONS) {
    const sortedDates = Array.from(recentDailySessions.keys()).sort((a, b) => b.localeCompare(a));
    const datesToKeep = new Set(sortedDates.slice(0, MAX_SESSIONS));
    for (const dateKey of Array.from(recentDailySessions.keys())) {
      if (!datesToKeep.has(dateKey)) {
        recentDailySessions.delete(dateKey);
        console.log(`[Session Cache] Evicted oldest session (>2 business days): ${dateKey}`);
      }
    }
  }
}

const server = http.createServer(async (req, res) => {
  // Enable CORS for local network access
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") {
    res.writeHead(204);
    res.end();
    return;
  }

  const url = new URL(req.url, `http://${req.headers.host}`);
  const pathname = url.pathname;

  // --- API Endpoints for Shared Daily Session ---
  if (pathname === "/api/session/active" && req.method === "GET") {
    evictOldSessions();
    const sortedDates = Array.from(recentDailySessions.keys()).sort((a, b) => b.localeCompare(a));
    const activeDate = sortedDates[0] || null;
    const sessionsObj = {};
    for (const [k, v] of recentDailySessions.entries()) {
      sessionsObj[k] = v;
    }

    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({
      active: recentDailySessions.size > 0,
      activeDate,
      availableDates: sortedDates,
      sessions: sessionsObj,
      session: activeDate ? recentDailySessions.get(activeDate) : null,
      manifests: sharedManifests,
      reqIntel: sharedReqIntel,
      samplerIntelligence: sharedSampleIntelligence,
    }));
    return;
  }

  if (pathname === "/api/session/day" && req.method === "GET") {
    evictOldSessions();
    const dateParam = url.searchParams.get("date");
    if (dateParam && recentDailySessions.has(dateParam)) {
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ success: true, session: recentDailySessions.get(dateParam) }));
    } else {
      res.writeHead(404, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ success: false, error: "Session not found in active business-day cache." }));
    }
    return;
  }

  if (pathname === "/api/session/upload" && req.method === "POST") {
    let body = "";
    req.on("data", (chunk) => { body += chunk; });
    req.on("end", () => {
      try {
        const data = JSON.parse(body);
        const samplingDate = data.manifest?.samplingDate || data.payload?.samplingDate || new Date().toISOString().slice(0, 10);
        const sessionObj = {
          payload: data.payload,
          manifest: data.manifest,
          reqIntel: data.reqIntel,
          uploadedAt: data.uploadedAt || new Date().toISOString(),
          uploader: data.uploader || "Lead Auditor",
          samplingDate,
        };

        recentDailySessions.set(samplingDate, sessionObj);
        evictOldSessions();

        if (data.manifest?.samplingDate) {
          sharedManifests[data.manifest.samplingDate] = data.manifest;
        }
        if (data.reqIntel?.samplingDate) {
          sharedReqIntel[data.reqIntel.samplingDate] = data.reqIntel;
        }

        const sortedDates = Array.from(recentDailySessions.keys()).sort((a, b) => b.localeCompare(a));
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({
          success: true,
          message: "Shared daily session active.",
          samplingDate,
          availableDates: sortedDates,
        }));
      } catch (err) {
        res.writeHead(400, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: err.message }));
      }
    });
    return;
  }

  if (pathname === "/api/session/sample" && req.method === "POST") {
    let body = "";
    req.on("data", (chunk) => { body += chunk; });
    req.on("end", () => {
      try {
        const data = JSON.parse(body);
        if (data.key && data.ticket) {
          sharedSampleIntelligence[data.key] = data.ticket;
        }
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ success: true }));
      } catch (err) {
        res.writeHead(400, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: err.message }));
      }
    });
    return;
  }

  if (pathname === "/api/session/reset" && req.method === "POST") {
    recentDailySessions.clear();
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ success: true, message: "Active daily sessions reset." }));
    return;
  }

  // --- Static Asset Serving ---
  let filePath = pathname === "/" ? "index.html" : pathname.replace(/^\//, "");
  filePath = path.join(__dirname, filePath);

  if (!fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) {
    filePath = path.join(__dirname, "index.html");
  }

  const ext = path.extname(filePath);
  const mimeTypes = {
    ".html": "text/html; charset=utf-8",
    ".js": "text/javascript; charset=utf-8",
    ".css": "text/css; charset=utf-8",
    ".json": "application/json",
    ".png": "image/png",
    ".jpg": "image/jpeg",
    ".svg": "image/svg+xml",
  };

  const contentType = mimeTypes[ext] || "text/plain";
  try {
    const content = fs.readFileSync(filePath);
    res.writeHead(200, { "Content-Type": contentType });
    res.end(content);
  } catch (err) {
    res.writeHead(404, { "Content-Type": "text/plain" });
    res.end("File not found");
  }
});

server.listen(PORT, () => {
  console.log(`====================================================`);
  console.log(`SAMPLER V3.4 — SHARED TEAM SERVER RUNNING`);
  console.log(`Local Access:   http://localhost:${PORT}`);
  console.log(`Network Access: http://<your-machine-ip>:${PORT}`);
  console.log(`====================================================`);
});

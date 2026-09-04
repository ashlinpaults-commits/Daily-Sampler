
let recentSharedSessions = {};
let activeSessionDate = null;
let sessionBroadcastChannel = null;

try {
  if (typeof BroadcastChannel !== "undefined") {
    sessionBroadcastChannel = new BroadcastChannel("sampler_daily_session");
    sessionBroadcastChannel.onmessage = (event) => {
      const data = event.data;
      if (data?.type === "SESSION_UPLOAD" && data.payload) {
        const dateKey = data.manifest?.samplingDate || data.samplingDate || todayDateKey();
        recentSharedSessions[dateKey] = {
          payload: data.payload,
          manifest: data.manifest,
          reqIntel: data.reqIntel,
          uploadedAt: new Date().toISOString(),
          uploader: data.uploader || "Auditor",
          samplingDate: dateKey,
        };
        activeSessionDate = dateKey;
        if (data.manifest) recordDailyManifest(data.manifest);
        if (data.reqIntel) recordWorkbookRequirementIntelligence(data.reqIntel);
        viewingHistorical = null;
        activatePayload(data.payload, `Done. ${formatWeekdayLabel(dateKey)} Sample loaded for active sampling.`);
        renderTodayCard();
        migrateLegacyStorageIdentities();
        renderHistoricalBanner();
      } else if (data?.type === "SESSION_RESET") {
        recentSharedSessions = {};
        activeSessionDate = null;
        currentPayload = null;
        allTickets = [];
        viewingHistorical = false;
        closeOpsModal();
        renderTodayCard();
        if (typeof render === "function") render();
      }
    };
  }
} catch (_) {}

async function syncDailySessionToServer(payload, manifest, reqIntel) {
  try {
    const dateKey = manifest?.samplingDate || payload?.samplingDate || todayDateKey();
    recentSharedSessions[dateKey] = {
      payload,
      manifest,
      reqIntel,
      uploadedAt: new Date().toISOString(),
      uploader: manifest?.uploader || "Lead Auditor",
      samplingDate: dateKey,
    };
    activeSessionDate = dateKey;

    if (sessionBroadcastChannel) {
      sessionBroadcastChannel.postMessage({
        type: "SESSION_UPLOAD",
        payload,
        manifest,
        reqIntel,
        samplingDate: dateKey,
        uploader: manifest?.uploader,
      });
    }
    if (typeof window !== "undefined" && window.location?.protocol?.startsWith("http")) {
      await fetch("/api/session/upload", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ payload, manifest, reqIntel, uploader: manifest?.uploader }),
      });
    }
  } catch (_) {}
}

async function syncDailySessionResetToServer() {
  try {
    recentSharedSessions = {};
    activeSessionDate = null;
    if (sessionBroadcastChannel) {
      sessionBroadcastChannel.postMessage({ type: "SESSION_RESET" });
    }
    if (typeof window !== "undefined" && window.location?.protocol?.startsWith("http")) {
      await fetch("/api/session/reset", { method: "POST" });
    }
  } catch (_) {}
}

async function checkRemoteDailySession() {
  try {
    if (typeof window !== "undefined" && window.location?.protocol?.startsWith("http")) {
      const res = await fetch("/api/session/active");
      if (res.ok) {
        const data = await res.json();
        if (data?.active && data?.sessions) {
          recentSharedSessions = data.sessions;
          const availableDates = data.availableDates || Object.keys(data.sessions).sort((a, b) => b.localeCompare(a));
          const expectedSampleDate = computeDefaultSamplingDate(todayDateKey());
          
          if (!activeSessionDate || !recentSharedSessions[activeSessionDate]) {
            // Prioritize the expected business sample date for today (e.g. Friday sample on Monday)
            if (recentSharedSessions[expectedSampleDate]) {
              activeSessionDate = expectedSampleDate;
            } else {
              activeSessionDate = availableDates[0];
            }
          }

          const currentSession = recentSharedSessions[activeSessionDate];
          if (currentSession?.payload) {
            if (currentSession.manifest) recordDailyManifest(currentSession.manifest);
            if (currentSession.reqIntel) recordWorkbookRequirementIntelligence(currentSession.reqIntel);
            viewingHistorical = null;
            activatePayload(currentSession.payload, `Done. ${formatWeekdayLabel(currentSession.manifest?.samplingDate || activeSessionDate)} Sample loaded for active sampling.`);
            renderTodayCard();
            renderHistoricalBanner();
          }
        } else if (data && !data.active) {
          // If server was restarted and has 0 sessions in memory, clear local volatile cache
          if (Object.keys(recentSharedSessions).length > 0) {
            recentSharedSessions = {};
            activeSessionDate = null;
            currentPayload = null;
            allTickets = [];
            renderTodayCard();
            if (typeof render === "function") render();
          }
        }
      }
    }
  } catch (_) {}
}

function switchActiveDailySession(targetDate) {
  if (!recentSharedSessions[targetDate]) {
    fetch(`/api/session/day?date=${encodeURIComponent(targetDate)}`)
      .then((r) => r.json())
      .then((data) => {
        if (data?.success && data?.session?.payload) {
          recentSharedSessions[targetDate] = data.session;
          applySessionDateSwitch(targetDate);
        }
      })
      .catch(() => {});
    return;
  }
  applySessionDateSwitch(targetDate);
}

function applySessionDateSwitch(targetDate) {
  const session = recentSharedSessions[targetDate];
  if (!session?.payload) return;
  activeSessionDate = targetDate;
  if (session.manifest) recordDailyManifest(session.manifest);
  if (session.reqIntel) recordWorkbookRequirementIntelligence(session.reqIntel);
  viewingHistorical = null;
  activatePayload(session.payload, `Viewing ${formatWeekdayLabel(session.manifest?.samplingDate || targetDate)} Sample.`);
  renderTodayCard();
  renderHistoricalBanner();
}

function triggerHapticPulse() {
  try {
    if (typeof navigator !== "undefined" && typeof navigator.vibrate === "function") {
      navigator.vibrate(10);
    }
  } catch (_) {}
}

const DEFAULT_AUDITORS = [
  {
    name: "Ashlin Paul",
    agents: [
      "Adheena I Sivan",
      "Goutham J",
      "Karthik Rajimon",
      "Kaushik K",
      "Nithil Louis Boban",
      "Rohith R",
      "Vishnu Suresh",
      "Aaron Shajan Johns",
      "Fathima Faseeka",
      "Razeen Rahim",
    ],
  },
  {
    name: "Abhijith Bharathan",
    agents: ["Akshaya N", "Leah Suzanne Punnoose", "Muhammed Bazil S", "Nitesh Raj", "Zon Paul", "Akash Anil", "Mili Sara Thomas"],
  },
  {
    name: "Manoj M",
    agents: [
      "Aadarsh S",
      "Abhijith Vijay",
      "Anandu Somaraj",
      "Bhadra R",
      "Peter Anil Mathew",
      "Presanth B",
      "Surya Dev S. B.",
      "Swathi Krishna S. A.",
      "Swetha U Krishnan",
      "Vinayak Sadanandan Kumar",
    ],
  },
  {
    name: "Midhun Mohan",
    agents: [
      "Abinitha E A",
      "Adithya Chandran",
      "Aleena Jose",
      "Angita C Anil",
      "Antony Neval Remalo",
      "Ganga Gopan",
      "Noel Stephen",
      "Subin Suresh",
      "Theertha S Ajay",
      "Tina Jose",
      "Vivek K S",
    ],
  },
];

// Master roster of valid agent names, in default grouping order. This never
// changes - what CAN change (via the Assign Agents panel) is which auditor
// each of these names currently reports to.
const AGENT_ROSTER = DEFAULT_AUDITORS.flatMap((auditor) => auditor.agents);
const AUDITOR_NAMES = DEFAULT_AUDITORS.map((auditor) => auditor.name);

// ================= Phase 6 Storage Quota Hardening =================
// Centralized, crash-proof wrapper for all localStorage write operations.
// QuotaExceededError or private browsing restrictions will NEVER interrupt
// active in-memory analysis, sampling, copying, or rendering workflows.
function safeStorageSetItem(key, value) {
  try {
    localStorage.setItem(key, value);
    return true;
  } catch (error) {
    console.warn(`[Sampler Storage] Non-blocking storage failure for key "${key}":`, error);
    if (typeof statusEl !== "undefined" && statusEl) {
      statusEl.textContent = `Notice: Local storage write for ${key} was skipped (${error?.name || "quota limit"}). Current in-memory sampling session remains active.`;
    }
    return false;
  }
}

function loadAgentAssignments() {
  const assignments = {};
  for (const auditor of DEFAULT_AUDITORS) {
    for (const agent of auditor.agents) assignments[agent] = auditor.name;
  }
  try {
    const saved = JSON.parse(localStorage.getItem("agentAssignmentsV1") || "null");
    if (saved && typeof saved === "object") {
      // Overlay every saved key so agents added or renamed survive a reload.
      for (const [agent, auditor] of Object.entries(saved)) {
        if (agent && auditor) assignments[agent] = auditor;
      }
    }
  } catch {
    // Corrupt/old storage - fall back to the defaults already set above.
  }
  return assignments;
}

let agentAssignments = loadAgentAssignments();

function buildAuditorsFromAssignments() {
  // Roster is whatever's currently in the assignment map, not the fixed
  // DEFAULT_AUDITORS list - this is what lets brand-new agent names (from
  // an Excel import) show up without a code change.
  return AUDITOR_NAMES.map((name) => ({
    name,
    agents: Object.keys(agentAssignments)
      .filter((agent) => agentAssignments[agent] === name)
      .sort((a, b) => a.localeCompare(b)),
  }));
}

function recomputeAgentAuditorMaps() {
  AUDITORS = buildAuditorsFromAssignments();
  TARGET_AGENTS = AUDITORS.flatMap((auditor) => auditor.agents);
  AGENT_LOOKUP = Object.fromEntries(TARGET_AGENTS.map((agent) => [normalizeName(agent), agent]));
  AGENT_TO_AUDITOR = Object.fromEntries(AUDITORS.flatMap((auditor) => auditor.agents.map((agent) => [agent, auditor.name])));
}

const AGENT_ALIASES_KEY = "agentAliasesV1";

function loadAgentAliases() {
  const defaults = {
    [normalizeName("Anandu S")]: "Anandu Somaraj",
    [normalizeName("Abijith Vijay")]: "Abhijith Vijay",
    [normalizeName("Shwetha U Krishnan")]: "Swetha U Krishnan",
    [normalizeName("Swetha Krishnan")]: "Swetha U Krishnan",
  };
  try {
    const saved = JSON.parse(localStorage.getItem(AGENT_ALIASES_KEY) || "{}");
    return { ...defaults, ...(typeof saved === "object" && saved !== null ? saved : {}) };
  } catch {
    return defaults;
  }
}

let AGENT_ALIASES = loadAgentAliases();

function saveAgentAliases() {
  safeStorageSetItem(AGENT_ALIASES_KEY, JSON.stringify(AGENT_ALIASES));
}

function addAgentAlias(alias, canonicalAgent) {
  const normAlias = normalizeName(alias);
  if (!normAlias || !canonicalAgent) return;
  AGENT_ALIASES[normAlias] = canonicalAgent;
  saveAgentAliases();
}

let AUDITORS = buildAuditorsFromAssignments();
let TARGET_AGENTS = AUDITORS.flatMap((auditor) => auditor.agents);
let AGENT_LOOKUP = Object.fromEntries(TARGET_AGENTS.map((agent) => [normalizeName(agent), agent]));
let AGENT_TO_AUDITOR = Object.fromEntries(AUDITORS.flatMap((auditor) => auditor.agents.map((agent) => [agent, auditor.name])));

// ================= Lightweight assignment history =================
// Local cache is capped for display/export performance - Firestore (when
// reachable) is the permanent, uncapped record per "do not overwrite
// history" - every change is a new document there, never trimmed.
// Storage shape (localStorage key "assignmentHistoryV1"), newest first:
//   [{ id, timestamp, agent, from, to, action, changedBy }]
// action is one of "Reassigned" | "Marked Inactive" | "Reactivated" | "Added".
function loadAssignmentHistory() {
  try {
    const items = JSON.parse(localStorage.getItem("assignmentHistoryV1") || "[]");
    return Array.isArray(items) ? items : [];
  } catch {
    return [];
  }
}

let assignmentHistory = loadAssignmentHistory();

function saveAssignmentHistory() {
  assignmentHistory = assignmentHistory.slice(0, 100);
  safeStorageSetItem("assignmentHistoryV1", JSON.stringify(assignmentHistory));
}

// Writes both to the local cache (immediate, always succeeds) and to the
// shared "assignment_history" Firestore collection (best-effort, fire and
// forget - a failed remote write never blocks the UI or loses the local
// record). Doc ID = the local record's own id, so a retry never creates a
// second copy of the same change.
function logAssignmentHistory(entry) {
  const record = {
    id: `h_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    timestamp: new Date().toISOString(),
    changedBy: currentUpdaterName(),
    ...entry,
  };
  assignmentHistory.unshift(record);
  saveAssignmentHistory();

  const fs = fsBridge();
  if (fs) {
    fs.setDocument("assignment_history", record.id, {
      agentName: record.agent,
      previousAuditor: record.from,
      newAuditor: record.to,
      changedBy: record.changedBy,
      timestamp: record.timestamp,
    }).catch(() => {});
  }
}

// Refresh-based sync, same pattern as loadAgentRegistryFromFirestore(): one
// read on startup (and whenever the Assign Agents panel is opened), no
// onSnapshot. Firestore wins - remote records are merged into the local
// cache, deduped by id, newest first.
async function loadAssignmentHistoryFromFirestore() {
  const fs = fsBridge();
  if (!fs) return;
  try {
    const remote = await fs.getCollection("assignment_history");
    if (!remote || !Object.keys(remote).length) return;
    const remoteRecords = Object.entries(remote).map(([id, data]) => ({
      id,
      timestamp: data.timestamp || new Date(0).toISOString(),
      agent: data.agentName || "",
      from: data.previousAuditor || "(none)",
      to: data.newAuditor || "(none)",
      action: data.action || "Reassigned",
      changedBy: data.changedBy || "Unknown",
    }));
    const byId = new Map(assignmentHistory.map((item) => [item.id, item]));
    for (const record of remoteRecords) byId.set(record.id, record);
    assignmentHistory = [...byId.values()].sort((a, b) => (a.timestamp < b.timestamp ? 1 : -1));
    saveAssignmentHistory();
    if (document.querySelector(".assign-history-table")) refreshAssignHistoryTable();
  } catch {
    // Offline/permission error - keep whatever's already cached locally.
  }
}

function saveAgentAssignments() {
  safeStorageSetItem("agentAssignmentsV1", JSON.stringify(agentAssignments));
}

// Applies a full agent->auditor map: persists it, rebuilds the AUDITORS
// family of lookups, patches any already-analyzed payload in place (so an
// uploaded file doesn't need re-uploading), and refreshes the UI.
function commitAgentAssignments(newAssignments) {
  const previous = agentAssignments;
  const changedAgents = [];
  for (const agent of Object.keys(newAssignments)) {
    if (previous[agent] && previous[agent] !== newAssignments[agent]) {
      logAssignmentHistory({ agent, from: previous[agent], to: newAssignments[agent], action: "Reassigned" });
      changedAgents.push(agent);
    }
  }
  agentAssignments = { ...agentAssignments, ...newAssignments };
  saveAgentAssignments();
  if (changedAgents.length) pushAgentsToFirestore(changedAgents);
  recomputeAgentAuditorMaps();
  reassignCurrentPayloadAuditors();
  if (!AUDITORS.some((auditor) => auditor.name === activeAuditor)) {
    activeAuditor = AUDITORS[0]?.name || null;
  }
  render();
}

// currentPayload.agents/tickets already carry a baked-in `auditor` field
// from when the workbook was analyzed. Reassigning agents afterwards needs
// those fields patched too, or the tabs would show stale groupings.
function reassignCurrentPayloadAuditors() {
  if (!currentPayload) return;
  for (const agentGroup of currentPayload.agents) {
    const newAuditor = AGENT_TO_AUDITOR[agentGroup.agent];
    agentGroup.auditor = newAuditor;
    for (const ticket of agentGroup.tickets) ticket.auditor = newAuditor;
  }
}

function resetAgentAssignments() {
  const defaults = {};
  for (const auditor of DEFAULT_AUDITORS) {
    for (const agent of auditor.agents) defaults[agent] = auditor.name;
  }
  commitAgentAssignments(defaults);
}

// ================= Agent status (Active / Inactive) =================
// Forward-looking exclusion only: an Inactive agent is skipped by
// getActiveAgents() (the single choke point every sampling/metrics/ranking
// view already reads through), so they immediately stop showing up in
// future recommendations, eligible counts, and workload numbers - without
// touching currentPayload, ticketHistory, or any already-stored data.
// Historical ticket ownership and worksheet data are never modified.
//
// Storage shape (localStorage key "agentStatusV1"):
//   { "Agent Name": "Inactive", ... }
// Active is the default and is never written - only exceptions are stored,
// so any agent missing from this map is Active automatically (including
// brand-new agents added later).
function loadAgentStatus() {
  const status = {};
  try {
    const saved = JSON.parse(localStorage.getItem("agentStatusV1") || "null");
    if (saved && typeof saved === "object") {
      for (const [agent, value] of Object.entries(saved)) {
        if (agent && value === "Inactive") status[agent] = "Inactive";
      }
    }
  } catch {
    // Corrupt/old storage - everyone defaults to Active.
  }
  return status;
}

let agentStatus = loadAgentStatus();

function saveAgentStatus() {
  safeStorageSetItem("agentStatusV1", JSON.stringify(agentStatus));
}

// Only "Active" and "Inactive" are implemented this phase, but reading
// through this getter (rather than the raw map) keeps the door open for
// future statuses like "On Leave" or "Training" without touching callers.
function getAgentStatus(agent) {
  return agentStatus[agent] === "Inactive" ? "Inactive" : "Active";
}

function isAgentActive(agent) {
  return getAgentStatus(agent) !== "Inactive";
}

function setAgentStatus(agent, status) {
  const wasInactive = agentStatus[agent] === "Inactive";
  const auditor = agentAssignments[agent] || "-";
  if (status === "Inactive" && !wasInactive) {
    logAssignmentHistory({ agent, from: auditor, to: auditor, action: "Marked Inactive" });
  } else if (status !== "Inactive" && wasInactive) {
    logAssignmentHistory({ agent, from: auditor, to: auditor, action: "Reactivated" });
  }
  if (status === "Inactive") agentStatus[agent] = "Inactive";
  else delete agentStatus[agent];
  saveAgentStatus();
  pushAgentsToFirestore([agent]);
  renderAuditorTabs();
  render();
}

function todayDateKey() {
  const now = new Date();
  const yyyy = now.getFullYear();
  const mm = String(now.getMonth() + 1).padStart(2, "0");
  const dd = String(now.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

// Not for security - just a deterministic, order-independent way to compare
// two uploads. Same inputs always produce the same output.
function simpleHash(text) {
  let hash = 0;
  for (let i = 0; i < text.length; i += 1) {
    hash = (hash * 31 + text.charCodeAt(i)) >>> 0;
  }
  return hash.toString(16);
}

function mostCommonValue(values) {
  const counts = new Map();
  for (const value of values) {
    if (!value) continue;
    counts.set(value, (counts.get(value) || 0) + 1);
  }
  let best = null;
  let bestCount = 0;
  for (const [value, count] of counts.entries()) {
    if (count > bestCount) {
      best = value;
      bestCount = count;
    }
  }
  return best;
}

// Fingerprint per spec: ticket IDs + total count + workbook date + first/last
// ticket ID, all folded into one deterministic hash for comparison.
function computeWorkbookFingerprint(payload) {
  const allTickets = payload.agents.flatMap((agent) => agent.tickets);
  const ids = [...new Set(allTickets.map((ticket) => clean(ticket.ticketId)).filter(Boolean))].sort();
  const ticketCount = ids.length;
  const firstTicketId = ids[0] || "";
  const lastTicketId = ids[ids.length - 1] || "";
  const workbookDate = mostCommonValue(allTickets.map((ticket) => ticket.date)) || "";
  const raw = `${workbookDate}|${ticketCount}|${firstTicketId}|${lastTicketId}|${ids.join(",")}`;
  return { fingerprint: simpleHash(raw), ticketCount, firstTicketId, lastTicketId, workbookDate };
}

function promptForUploaderName() {
  const lastName = localStorage.getItem("lastUploaderNameV1") || "";
  const name = clean(prompt("Your name (for the worksheet record, optional):", lastName));
  if (name) safeStorageSetItem("lastUploaderNameV1", name);
  return name || null;
}

// ================= QA calendar (Sampling Date vs Upload Date) =================
// Sampling Date is the business day the tickets actually belong to - always
// the previous business day relative to whatever day the file is uploaded
// (Mon upload -> Fri sample, Tue..Fri upload -> the day before). The user
// still picks it explicitly (a suggested default, not a silent guess), but
// this is what pre-fills that picker.
function dateKeyToDate(dateKey) {
  if (!dateKey) return new Date();
  if (/^\d{2}\/\d{2}\/\d{4}$/.test(dateKey)) {
    const [mm, dd, yyyy] = dateKey.split("/");
    return new Date(`${yyyy}-${mm}-${dd}T00:00:00`);
  }
  return new Date(`${dateKey}T00:00:00`);
}

function normalizeDateKey(dateKey) {
  if (!dateKey) return todayDateKey();
  if (/^\d{4}-\d{2}-\d{2}$/.test(dateKey)) return dateKey;
  if (/^\d{2}\/\d{2}\/\d{4}$/.test(dateKey)) {
    const [mm, dd, yyyy] = dateKey.split("/");
    return `${yyyy}-${mm}-${dd}`;
  }
  const d = new Date(dateKey);
  return Number.isNaN(d.getTime()) ? todayDateKey() : dateToKey(d);
}

function dateToKey(date) {
  const yyyy = date.getFullYear();
  const mm = String(date.getMonth() + 1).padStart(2, "0");
  const dd = String(date.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

function addDaysToKey(dateKey, days) {
  const date = dateKeyToDate(dateKey);
  date.setDate(date.getDate() + days);
  return dateToKey(date);
}

function isWeekendKey(dateKey) {
  const day = dateKeyToDate(dateKey).getDay();
  return day === 0 || day === 6;
}

function computeDefaultSamplingDate(referenceDateKey) {
  const day = dateKeyToDate(referenceDateKey).getDay(); // 0 Sun .. 6 Sat
  const stepBack = day === 1 ? 3 : day === 0 ? 2 : day === 6 ? 1 : 1;
  return addDaysToKey(referenceDateKey, -stepBack);
}

// ================= Reporting calendar (single source of truth) =================
// Locked business rule: reporting week runs Saturday through Friday, numbered
// continuously across the whole year (not reset per month).
// Each reporting year's Week 1 starts on the Saturday on/after Jan 1 -
// EXCEPT when Jan 1 itself falls on a Friday, in which case the following
// Sat/Sun are excluded and Week 1 operationally starts the next Monday
// (a short Mon-Fri week). This is the only way to satisfy the locked
// 2027 W01 = 01/04/2027 boundary alongside every other locked boundary.
function getReportingYearAnchorKey(year) {
  const jan1Key = `${year}-01-01`;
  const day = dateKeyToDate(jan1Key).getDay(); // 0 Sun .. 6 Sat
  if (day === 5) return addDaysToKey(jan1Key, 3); // Fri Jan 1 -> following Monday
  const daysToSaturday = (6 - day + 7) % 7;
  return addDaysToKey(jan1Key, daysToSaturday);
}

function computeQaWeekNumber(samplingDateKey) {
  const normKey = normalizeDateKey(samplingDateKey);
  let year = dateKeyToDate(normKey).getFullYear();
  let anchorKey = getReportingYearAnchorKey(year);
  let isPriorCycleTail = false;
  if (normKey < anchorKey) {
    // Falls in the previous cycle's tail (e.g. Jan 1-3 before the next
    // year's anchor) - belongs to the prior reporting year's last week (W52).
    year -= 1;
    anchorKey = getReportingYearAnchorKey(year);
    isPriorCycleTail = true;
  }
  const diffDays = Math.round((dateKeyToDate(normKey) - dateKeyToDate(anchorKey)) / 86400000);
  const weekNum = Math.floor(diffDays / 7) + 1;
  return isPriorCycleTail ? Math.min(weekNum, 52) : Math.min(weekNum, 52);
}

function computeQaMonthKey(samplingDateKey) {
  return normalizeDateKey(samplingDateKey).slice(0, 7); // "YYYY-MM"
}

function computeQaQuarterKey(samplingDateKey) {
  const weekNumber = computeQaWeekNumber(samplingDateKey);
  let year = dateKeyToDate(samplingDateKey).getFullYear();
  const anchorKey = getReportingYearAnchorKey(year);
  if (samplingDateKey < anchorKey) {
    year -= 1;
  }
  if (weekNumber <= 12) return `${year}-Q1`;
  if (weekNumber <= 25) return `${year}-Q2`;
  if (weekNumber <= 38) return `${year}-Q3`;
  return `${year}-Q4`;
}

function getQuarterDetails(quarterKey) {
  const [yearStr, qStr] = quarterKey.split("-");
  const year = Number(yearStr) || new Date().getFullYear();
  const q = qStr || "Q1";
  const map = {
    Q1: { startWeek: 1, endWeek: 12, label: `Q1 ${year} (Weeks 1–12)` },
    Q2: { startWeek: 13, endWeek: 25, label: `Q2 ${year} (Weeks 13–25)` },
    Q3: { startWeek: 26, endWeek: 38, label: `Q3 ${year} (Weeks 26–38)` },
    Q4: { startWeek: 39, endWeek: 52, label: `Q4 ${year} (Weeks 39–52)` },
  };
  return map[q] || map.Q1;
}

function getPriorQuarterKey(quarterKey) {
  const [yearStr, qStr] = quarterKey.split("-");
  let year = Number(yearStr) || new Date().getFullYear();
  if (qStr === "Q4") return `${year}-Q3`;
  if (qStr === "Q3") return `${year}-Q2`;
  if (qStr === "Q2") return `${year}-Q1`;
  return `${year - 1}-Q4`;
}

function shiftMonthKey(monthKey, delta) {
  const [year, month] = monthKey.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1 + delta, 1));
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`;
}

function formatMonthLabel(monthKey) {
  const [year, month] = monthKey.split("-").map(Number);
  return new Date(year, month - 1, 1).toLocaleDateString(undefined, { month: "long", year: "numeric" });
}

function getWeekWindow(weekNumber, year) {
  const targetYear = Number(year) || new Date().getFullYear();
  const targetWeek = Number(weekNumber) || 1;
  const anchorKey = getReportingYearAnchorKey(targetYear);
  const [ay, am, ad] = anchorKey.split("-").map(Number);
  const startDate = new Date(Date.UTC(ay, am - 1, ad + (targetWeek - 1) * 7));
  const endDate = new Date(Date.UTC(ay, am - 1, ad + (targetWeek - 1) * 7 + 6));
  return `${formatLongDate(startDate)} to ${formatLongDate(endDate)}`;
}

function getMostRecentCompletedReportingWeek(referenceDateKey) {
  const refKey = normalizeDateKey(referenceDateKey || todayDateKey());
  const day = dateKeyToDate(refKey).getDay(); // 0 Sun .. 6 Sat
  // Reporting week runs Saturday through Friday, ending on Friday.
  // The most recent completed reporting week ended on the preceding Friday.
  const daysSinceFriday = (day - 5 + 7) % 7;
  const lastFridayKey = addDaysToKey(refKey, -daysSinceFriday);
  const weekNumber = computeQaWeekNumber(lastFridayKey);
  let year = dateKeyToDate(lastFridayKey).getFullYear();
  const anchor = getReportingYearAnchorKey(year);
  if (lastFridayKey < anchor) year -= 1;
  return {
    weekNumber,
    year,
    dateKey: lastFridayKey,
    label: `Week ${weekNumber} (${year})`,
    window: getWeekWindow(weekNumber, year),
  };
}

function formatWeekdayLabel(dateKey) {
  return dateKeyToDate(dateKey).toLocaleDateString(undefined, { weekday: "long" });
}

// ================= Compact Sampler Intelligence (Phase 4 & 6 Model) =================
// Raw N-1 workbook payloads are strictly in-memory only.
// Only tickets actually added to that day's Samples list (via Copy All Ideal Picks
// or individual ticket Copy) become persistent Sampler Intelligence.
// In Phase 6, samplerIntelligence is keyed on `${channel}::${ticketId}` to prevent cross-channel ID collisions.
const SAMPLER_INTELLIGENCE_KEY = "samplerIntelligenceV1";
const SAMPLER_DAILY_MANIFEST_KEY = "samplerDailyManifestV1";
const SAMPLER_HISTORICAL_SUMMARIES_KEY = "samplerHistoricalSummariesV1";
const WORKBOOK_REQUIREMENT_INTELLIGENCE_KEY = "workbookRequirementIntelligenceV1";

const PERSISTENT_STORAGE_KEYS = [
  "samplerIntelligenceV1",
  "workbookRequirementIntelligenceV1",
  "samplerDailyManifestV1",
  "samplerHistoricalSummariesV1",
  "copiedTickets",
  "agentAssignmentsV1",
  "agentStatusV1",
  "agentAliasesV1",
  "assignmentHistoryV1",
  "watchlistItemsV1",
];

const STORAGE_BUDGET_BYTES = 5 * 1024 * 1024; // 5 MB nominal browser storage budget
const PROACTIVE_COMPACT_THRESHOLD = 0.80; // 80% of budget (4 MB)

function getSampleKey(channel, ticketId) {
  const ch = (channel || "").trim() || "General";
  const id = String(ticketId || "").trim();
  return `${ch}::${id}`;
}

function getStorageUsageMetrics() {
  let totalChars = 0;
  let totalBytes = 0;
  const keyBreakdown = {};

  for (const key of PERSISTENT_STORAGE_KEYS) {
    try {
      const val = localStorage.getItem(key) || "";
      const charLen = key.length + val.length;
      let byteLen;
      if (typeof TextEncoder !== "undefined") {
        byteLen = new TextEncoder().encode(key + val).length;
      } else {
        byteLen = typeof Buffer !== "undefined" ? Buffer.byteLength(key + val, "utf8") : charLen * 2;
      }
      totalChars += charLen;
      totalBytes += byteLen;
      keyBreakdown[key] = { chars: charLen, bytes: byteLen, kb: (byteLen / 1024).toFixed(1) };
    } catch {
      keyBreakdown[key] = { chars: 0, bytes: 0, kb: "0.0" };
    }
  }

  const usagePercent = Math.min(100, Math.round((totalBytes / STORAGE_BUDGET_BYTES) * 100));
  const isAboveThreshold = totalBytes >= STORAGE_BUDGET_BYTES * PROACTIVE_COMPACT_THRESHOLD;

  return {
    totalBytes,
    totalChars,
    totalKb: (totalBytes / 1024).toFixed(1),
    totalMb: (totalBytes / (1024 * 1024)).toFixed(2),
    budgetBytes: STORAGE_BUDGET_BYTES,
    budgetMb: "5.00",
    usagePercent,
    isAboveThreshold,
    keyBreakdown,
  };
}

function checkAndTriggerProactiveCompaction(force = false) {
  const metrics = getStorageUsageMetrics();
  if (metrics.isAboveThreshold || force) {
    console.info(`[Sampler Storage] Proactive compaction triggered (Storage usage: ${metrics.totalMb} MB / ${metrics.usagePercent}% of budget)`);
    // Ensure in-memory state is synchronized with storage if needed
    if (!Object.keys(workbookRequirementIntelligence).length) {
      workbookRequirementIntelligence = loadWorkbookRequirementIntelligence();
    }
    // 1. Locked reporting quarter compaction (prune individual missTickets from historical quarters)
    const activeQuarterKey = computeQaQuarterKey(todayDateKey());
    let popChanged = false;
    for (const [dateKey, rec] of Object.entries(workbookRequirementIntelligence)) {
      if (!rec) continue;
      const recQuarter = rec.qaQuarter || computeQaQuarterKey(dateKey);
      if (recQuarter < activeQuarterKey && rec.missTickets) {
        delete rec.missTickets;
        popChanged = true;
      }
    }
    if (popChanged) {
      safeStorageSetItem(WORKBOOK_REQUIREMENT_INTELLIGENCE_KEY, JSON.stringify(workbookRequirementIntelligence));
    }
    // 2. Prune manifests older than 60 days if storage pressure exists
    const manifestDates = Object.keys(samplerDailyManifests).sort();
    if (manifestDates.length > 60) {
      const pruneCount = manifestDates.length - 60;
      for (let i = 0; i < pruneCount; i++) {
        delete samplerDailyManifests[manifestDates[i]];
      }
      safeStorageSetItem(SAMPLER_DAILY_MANIFEST_KEY, JSON.stringify(samplerDailyManifests));
    }
  }
}

function loadSamplerIntelligence() {
  try {
    const data = JSON.parse(localStorage.getItem(SAMPLER_INTELLIGENCE_KEY) || "{}");
    if (!data || typeof data !== "object" || Array.isArray(data)) return {};
    const migrated = {};
    let needsSave = false;
    for (const [key, val] of Object.entries(data)) {
      if (!val || typeof val !== "object") continue;
      const channel = val.channel || (key.includes("::") ? key.split("::")[0] : "General");
      const ticketId = String(val.id || val.ticketId || (key.includes("::") ? key.split("::")[1] : key));
      const compositeKey = getSampleKey(channel, ticketId);
      migrated[compositeKey] = {
        ...val,
        id: ticketId,
        channel: channel,
      };
      if (key !== compositeKey) needsSave = true;
    }
    if (needsSave) {
      safeStorageSetItem(SAMPLER_INTELLIGENCE_KEY, JSON.stringify(migrated));
    }
    return migrated;
  } catch {
    return {};
  }
}

let samplerIntelligence = loadSamplerIntelligence();

function saveSamplerIntelligence() {
  safeStorageSetItem(SAMPLER_INTELLIGENCE_KEY, JSON.stringify(samplerIntelligence));
  checkAndTriggerProactiveCompaction();
}

function loadDailyManifests() {
  try {
    const data = JSON.parse(localStorage.getItem(SAMPLER_DAILY_MANIFEST_KEY) || "{}");
    return data && typeof data === "object" && !Array.isArray(data) ? data : {};
  } catch {
    return {};
  }
}

let samplerDailyManifests = loadDailyManifests();

function saveDailyManifests() {
  // Keep up to 3 months of daily manifests (~60-70 business days)
  const monthsPresent = [...new Set(Object.keys(samplerDailyManifests).map(computeQaMonthKey))].sort();
  if (monthsPresent.length > 3) {
    const keepMonths = new Set(monthsPresent.slice(-3));
    for (const dateKey of Object.keys(samplerDailyManifests)) {
      if (!keepMonths.has(computeQaMonthKey(dateKey))) delete samplerDailyManifests[dateKey];
    }
  }
  safeStorageSetItem(SAMPLER_DAILY_MANIFEST_KEY, JSON.stringify(samplerDailyManifests));
}

function getDailyManifest(samplingDateKey) {
  return samplerDailyManifests[samplingDateKey] || null;
}

function recordDailyManifest(manifest) {
  samplerDailyManifests[manifest.samplingDate] = manifest;
  saveDailyManifests();
}

function loadHistoricalSummaries() {
  try {
    const data = JSON.parse(localStorage.getItem(SAMPLER_HISTORICAL_SUMMARIES_KEY) || "{}");
    return data && typeof data === "object" && !Array.isArray(data) ? data : {};
  } catch {
    return {};
  }
}

let samplerHistoricalSummaries = loadHistoricalSummaries();

function saveHistoricalSummaries() {
  safeStorageSetItem(SAMPLER_HISTORICAL_SUMMARIES_KEY, JSON.stringify(samplerHistoricalSummaries));
}

// ================= Population Requirement Intelligence =================
// Retains compact aggregate Requirement Check analytics across ALL eligible
// analyzed tickets in the N-1 workbook without storing raw ticket payloads.
function loadWorkbookRequirementIntelligence() {
  try {
    const data = JSON.parse(localStorage.getItem(WORKBOOK_REQUIREMENT_INTELLIGENCE_KEY) || "{}");
    return data && typeof data === "object" && !Array.isArray(data) ? data : {};
  } catch {
    return {};
  }
}

let workbookRequirementIntelligence = loadWorkbookRequirementIntelligence();

function saveWorkbookRequirementIntelligence() {
  const activeQuarterKey = computeQaQuarterKey(todayDateKey());
  for (const [dateKey, rec] of Object.entries(workbookRequirementIntelligence)) {
    if (!rec) continue;
    const recQuarter = rec.qaQuarter || computeQaQuarterKey(dateKey);
    // When a quarter is completed/historical (prior to current active quarter),
    // prune individual missTickets while permanently preserving all aggregate counts and distributions
    if (recQuarter < activeQuarterKey && rec.missTickets) {
      delete rec.missTickets;
    }
  }
  safeStorageSetItem(WORKBOOK_REQUIREMENT_INTELLIGENCE_KEY, JSON.stringify(workbookRequirementIntelligence));
  checkAndTriggerProactiveCompaction();
}

function recordWorkbookRequirementIntelligence(record) {
  if (!record || !record.samplingDate) return;
  workbookRequirementIntelligence[record.samplingDate] = record;
  saveWorkbookRequirementIntelligence();
}

function aggregateWorkbookRequirementIntelligence(payload, samplingDateKey) {
  const dateKey = samplingDateKey || todayDateKey();
  const qaWeek = computeQaWeekNumber(dateKey);
  const qaMonth = computeQaMonthKey(dateKey);
  const qaQuarter = computeQaQuarterKey(dateKey);
  let year = dateKeyToDate(dateKey).getFullYear();
  const anchor = getReportingYearAnchorKey(year);
  if (dateKey < anchor) year -= 1;

  let totalAnalyzed = 0;
  let mergedCount = 0;
  let totalEligible = 0;
  let cleanCount = 0;
  const missCounts = {};
  const channelMap = {
    Chat: { total: 0, clean: 0, misses: {} },
    Voice: { total: 0, clean: 0, misses: {} },
    Email: { total: 0, clean: 0, misses: {} },
  };
  const agentMap = {};
  const missTickets = [];

  for (const agentGroup of payload.agents || []) {
    const agentName = agentGroup.agent;
    if (!isAgentActive(agentName)) continue;

    const allAgentTickets = agentGroup.tickets || [];
    let agentAnalyzed = allAgentTickets.length;
    let agentMerged = 0;
    let agentEligible = 0;
    let agentClean = 0;
    const agentMisses = {};
    const agentChannels = {};

    for (const ticket of allAgentTickets) {
      totalAnalyzed += 1;
      if (ticket.isMergedChild) {
        mergedCount += 1;
        agentMerged += 1;
        continue;
      }

      totalEligible += 1;
      agentEligible += 1;
      const misses = getTicketMisses(ticket);
      const isClean = misses.length === 0;

      if (isClean) {
        cleanCount += 1;
        agentClean += 1;
      } else {
        for (const m of misses) {
          missCounts[m] = (missCounts[m] || 0) + 1;
          agentMisses[m] = (agentMisses[m] || 0) + 1;
        }
        missTickets.push({
          id: String(ticket.ticketId || ticket.id),
          agent: agentName,
          channel: ticket.channel || "Chat",
          misses,
        });
      }

      const ch = ticket.channel || "Chat";
      agentChannels[ch] = (agentChannels[ch] || 0) + 1;
      if (channelMap[ch]) {
        channelMap[ch].total += 1;
        if (isClean) {
          channelMap[ch].clean += 1;
        } else {
          for (const m of misses) {
            channelMap[ch].misses[m] = (channelMap[ch].misses[m] || 0) + 1;
          }
        }
      }
    }

    const agentMissed = agentEligible - agentClean;
    agentMap[agentName] = {
      totalAnalyzed: agentAnalyzed,
      merged: agentMerged,
      total: agentEligible, // Eligible Non-Merged
      clean: agentClean,
      missed: agentMissed,
      cleanRate: agentEligible ? Math.round((agentClean / agentEligible) * 100) : 0,
      missRate: agentEligible ? Math.round((agentMissed / agentEligible) * 100) : 0,
      misses: agentMisses,
      channels: agentChannels,
    };
  }

  const missedCount = totalEligible - cleanCount;
  const cleanRate = totalEligible ? Math.round((cleanCount / totalEligible) * 100) : 0;
  const missRate = totalEligible ? Math.round((missedCount / totalEligible) * 100) : 0;

  return {
    samplingDate: dateKey,
    qaWeek,
    qaMonth,
    qaQuarter,
    reportingYear: year,
    totalAnalyzed,
    mergedCount,
    totalEligible,
    cleanCount,
    missedCount,
    cleanRate,
    missRate,
    misses: missCounts,
    channels: channelMap,
    agents: agentMap,
    missTickets,
    aggregatedAt: new Date().toISOString(),
  };
}

function rollupPopulationRequirementIntelligence(records) {
  if (!records || !records.length) {
    return {
      hasData: false,
      totalAnalyzed: 0,
      mergedCount: 0,
      totalEligible: 0,
      cleanCount: 0,
      missedCount: 0,
      cleanRate: 0,
      missRate: 0,
      misses: [],
      channels: {
        Chat: { total: 0, clean: 0, cleanRate: 0, missRate: 0, misses: [] },
        Voice: { total: 0, clean: 0, cleanRate: 0, missRate: 0, misses: [] },
        Email: { total: 0, clean: 0, cleanRate: 0, missRate: 0, misses: [] },
      },
      agents: {},
      missTickets: [],
    };
  }

  let totalAnalyzed = 0;
  let mergedCount = 0;
  let totalEligible = 0;
  let cleanCount = 0;
  const missCounts = {};
  const channelTotals = {
    Chat: { total: 0, clean: 0, misses: {} },
    Voice: { total: 0, clean: 0, misses: {} },
    Email: { total: 0, clean: 0, misses: {} },
  };
  const agentTotals = {};
  const allMissTickets = [];

  for (const rec of records) {
    totalAnalyzed += rec.totalAnalyzed || (rec.totalEligible || 0) + (rec.mergedCount || 0);
    mergedCount += rec.mergedCount || 0;
    totalEligible += rec.totalEligible || 0;
    cleanCount += rec.cleanCount || 0;

    if (Array.isArray(rec.missTickets)) {
      for (const mt of rec.missTickets) {
        allMissTickets.push({
          id: String(mt.id || mt.ticketId || ""),
          agent: mt.agent || "",
          channel: mt.channel || "Chat",
          date: mt.date || rec.samplingDate,
          year: mt.year || rec.reportingYear || (rec.qaQuarter ? Number(rec.qaQuarter.slice(0, 4)) : dateKeyToDate(rec.samplingDate).getFullYear()),
          week: mt.week !== undefined ? mt.week : rec.qaWeek,
          month: mt.month || rec.qaMonth,
          quarter: mt.quarter || rec.qaQuarter,
          misses: mt.misses || [],
          missCount: mt.missCount !== undefined ? mt.missCount : (mt.misses || []).length,
          checks: mt.checks || mt.misses || [],
        });
      }
    }

    for (const [m, count] of Object.entries(rec.misses || {})) {
      missCounts[m] = (missCounts[m] || 0) + count;
    }

    for (const [ch, chData] of Object.entries(rec.channels || {})) {
      if (channelTotals[ch]) {
        channelTotals[ch].total += chData.total || 0;
        channelTotals[ch].clean += chData.clean || 0;
        for (const [m, count] of Object.entries(chData.misses || {})) {
          channelTotals[ch].misses[m] = (channelTotals[ch].misses[m] || 0) + count;
        }
      }
    }

    for (const [agent, aData] of Object.entries(rec.agents || {})) {
      if (!agentTotals[agent]) {
        agentTotals[agent] = {
          totalAnalyzed: 0,
          merged: 0,
          total: 0,
          clean: 0,
          missed: 0,
          misses: {},
          channels: {},
        };
      }
      agentTotals[agent].totalAnalyzed += aData.totalAnalyzed || (aData.total || 0) + (aData.merged || 0);
      agentTotals[agent].merged += aData.merged || 0;
      agentTotals[agent].total += aData.total || 0;
      agentTotals[agent].clean += aData.clean || 0;
      agentTotals[agent].missed += aData.missed || 0;
      for (const [m, count] of Object.entries(aData.misses || {})) {
        agentTotals[agent].misses[m] = (agentTotals[agent].misses[m] || 0) + count;
      }
      for (const [c, count] of Object.entries(aData.channels || {})) {
        agentTotals[agent].channels[c] = (agentTotals[agent].channels[c] || 0) + count;
      }
    }
  }

  const missedCount = totalEligible - cleanCount;
  const cleanRate = totalEligible ? Math.round((cleanCount / totalEligible) * 100) : 0;
  const missRate = totalEligible ? Math.round((missedCount / totalEligible) * 100) : 0;

  const missList = Object.entries(missCounts)
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .map(([name, count]) => ({
      name,
      count,
      rate: totalEligible ? Math.round((count / totalEligible) * 100) : 0,
      severity: count >= 5 || (count / Math.max(totalEligible, 1)) >= 0.25 ? "Regular default" : "Occasional",
    }));

  const channelBreakdown = {};
  for (const [ch, chData] of Object.entries(channelTotals)) {
    const chCleanRate = chData.total ? Math.round((chData.clean / chData.total) * 100) : 0;
    const chMissRate = chData.total ? Math.round(((chData.total - chData.clean) / chData.total) * 100) : 0;
    channelBreakdown[ch] = {
      channel: ch,
      total: chData.total,
      clean: chData.clean,
      cleanRate: chCleanRate,
      missRate: chMissRate,
      misses: Object.entries(chData.misses)
        .map(([name, count]) => ({ name, count, rate: chData.total ? Math.round((count / chData.total) * 100) : 0 }))
        .sort((a, b) => b.count - a.count),
    };
  }

  const agentBreakdown = {};
  for (const [agent, aData] of Object.entries(agentTotals)) {
    const aCleanRate = aData.total ? Math.round((aData.clean / aData.total) * 100) : 0;
    const aMissRate = aData.total ? Math.round((aData.missed / aData.total) * 100) : 0;
    agentBreakdown[agent] = {
      agent,
      totalAnalyzed: aData.totalAnalyzed,
      merged: aData.merged,
      total: aData.total, // Eligible Non-Merged
      clean: aData.clean,
      missed: aData.missed,
      cleanRate: aCleanRate,
      missRate: aMissRate,
      channels: aData.channels,
      misses: Object.entries(aData.misses)
        .map(([name, count]) => ({ name, count }))
        .sort((a, b) => b.count - a.count),
    };
  }

  return {
    hasData: true,
    totalAnalyzed,
    mergedCount,
    totalEligible,
    cleanCount,
    missedCount,
    cleanRate,
    missRate,
    misses: missList,
    channels: channelBreakdown,
    agents: agentBreakdown,
    missTickets: allMissTickets,
  };
}

function extractSampledRecord(pick) {
  const tid = pick?.ticketId || pick?.id;
  if (!pick || !tid) return null;
  return {
    id: String(tid),
    date: normalizeDateKey(pick.date) || todayDateKey(),
    agent: pick.agent || "Unknown",
    auditor: pick.auditor || AGENT_TO_AUDITOR[pick.agent] || activeAuditor || "Unknown",
    channel: pick.channel || "Chat",
    misses: getTicketMisses(pick),
    subject: pick.subject || "",
    module: pick.module || "",
    feature: pick.feature || "",
    score: pick.score ?? null,
    copiedAt: new Date().toISOString(),
  };
}

function recordSampledTicket(pick) {
  const record = extractSampledRecord(pick);
  if (!record) return;
  const key = getSampleKey(record.channel, record.id);
  samplerIntelligence[key] = record;
  saveSamplerIntelligence();
  updateManifestSampledCount(record.date);
}

function recordSampledTickets(picks) {
  let changed = false;
  const dates = new Set();
  for (const pick of picks) {
    const record = extractSampledRecord(pick);
    if (!record) continue;
    const key = getSampleKey(record.channel, record.id);
    samplerIntelligence[key] = record;
    dates.add(record.date);
    changed = true;
  }
  if (changed) {
    saveSamplerIntelligence();
    for (const d of dates) updateManifestSampledCount(d);
  }
}

function removeSampledTicket(channelOrKey, ticketId) {
  let key;
  if (ticketId !== undefined && ticketId !== null) {
    key = getSampleKey(channelOrKey, ticketId);
  } else {
    key = String(channelOrKey || "");
  }
  let target = samplerIntelligence[key];
  if (!target && !key.includes("::")) {
    for (const [k, v] of Object.entries(samplerIntelligence)) {
      if (v.id === key) {
        key = k;
        target = v;
        break;
      }
    }
  }
  if (target) {
    const d = target.date;
    delete samplerIntelligence[key];
    saveSamplerIntelligence();
    if (d) updateManifestSampledCount(d);
  }
}

function hasCopiedTicket(channel, ticketId) {
  const compKey = getSampleKey(channel, ticketId);
  const bareId = String(ticketId || "");
  return Boolean(samplerIntelligence[compKey] || samplerIntelligence[bareId] || copiedTickets.has(compKey) || copiedTickets.has(bareId));
}

function updateManifestSampledCount(dateKey) {
  if (!dateKey) return;
  const manifest = samplerDailyManifests[dateKey];
  if (!manifest) return;
  const count = Object.values(samplerIntelligence).filter((t) => t.date === dateKey).length;
  manifest.sampledTicketCount = count;
  saveDailyManifests();
}

// One-time migration: Convert legacy data into compact Sampler Intelligence
(function migrateLegacyStorage() {
  try {
    const version = localStorage.getItem("samplerStorageVersion");
    if (version === "4.0") return;

    // 1. Migrate actually copied tickets from n1TicketHistoryV1 + copiedTickets
    const legacyHistory = JSON.parse(localStorage.getItem("n1TicketHistoryV1") || "null");
    const legacyCopied = JSON.parse(localStorage.getItem("copiedTickets") || "[]");
    const copiedSet = new Set(Array.isArray(legacyCopied) ? legacyCopied.map(String) : []);

    if (legacyHistory && typeof legacyHistory === "object") {
      for (const [id, ticket] of Object.entries(legacyHistory)) {
        if (copiedSet.has(String(id))) {
          if (!samplerIntelligence[id]) {
            samplerIntelligence[id] = {
              id: String(ticket.ticketId || id),
              date: ticket.date || todayDateKey(),
              agent: ticket.agent || "Unknown",
              auditor: ticket.auditor || "Unknown",
              channel: ticket.channel || "Chat",
              misses: getTicketMisses(ticket),
              subject: ticket.subject || "",
              module: ticket.module || "",
              feature: ticket.feature || "",
              score: ticket.score ?? null,
              copiedAt: ticket.uploadedAt || new Date().toISOString(),
            };
          }
        }
      }
      saveSamplerIntelligence();
    }

    // 2. Migrate daily upload manifests from worksheetLibraryV1 (metadata only, strip payload)
    const legacyLibrary = JSON.parse(localStorage.getItem("worksheetLibraryV1") || "null");
    if (legacyLibrary && typeof legacyLibrary === "object") {
      for (const [dateKey, record] of Object.entries(legacyLibrary)) {
        if (!samplerDailyManifests[dateKey]) {
          samplerDailyManifests[dateKey] = {
            samplingDate: record.samplingDate || dateKey,
            uploadDate: record.uploadDate || dateKey,
            uploadedAt: record.uploadedAt || new Date().toISOString(),
            uploader: record.uploader || record.uploaderName || "Unknown",
            workbookName: record.workbookName || "Workbook",
            totalWorkbookRows: record.ticketCount || 0,
            eligibleTicketCount: record.eligibleTicketCount || record.ticketCount || 0,
            sampledTicketCount: Object.values(samplerIntelligence).filter((t) => t.date === dateKey).length,
            fingerprint: record.fingerprint || "",
            qaWeek: record.qaWeek || computeQaWeekNumber(dateKey),
            qaMonth: record.qaMonth || computeQaMonthKey(dateKey),
          };
        }
      }
      saveDailyManifests();
    }

    // 3. Atomically remove bloated legacy storage keys
    localStorage.removeItem("n1TicketHistoryV1");
    localStorage.removeItem("worksheetLibraryV1");
    localStorage.removeItem("officialWorksheetV1");
    safeStorageSetItem("samplerStorageVersion", "4.0");
  } catch (err) {
    console.warn("Storage migration warning:", err);
  }
})();

function countEligibleTickets(payload) {
  return payload.agents.reduce(
    (sum, agent) => sum + agent.tickets.filter((ticket) => !ticket.isMergedChild && isAgentActive(agent.agent)).length,
    0,
  );
}

function formatWorksheetDateLabel(dateKey) {
  const date = new Date(`${dateKey}T00:00:00`);
  if (Number.isNaN(date.getTime())) return dateKey;
  return date.toLocaleDateString(undefined, { weekday: "long", day: "numeric", month: "short", year: "numeric" });
}

function formatWorksheetTimeLabel(iso) {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "-";
  return date.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
}

let viewingHistorical = null; // { samplingDate } | null

function renderTodayCard() {
  const el = document.querySelector("#todayCard");
  if (!el) return;
  const todaySamplingDate = computeDefaultSamplingDate(todayDateKey());
  const manifest = getDailyManifest(activeSessionDate || todaySamplingDate);

  const uploadIcon = `<svg class="app-icon icon-upload" viewBox="0 0 24 24" fill="none"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M17 8l-5-5-5 5M12 3v12" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
  const libraryIcon = `<svg class="app-icon icon-library" viewBox="0 0 24 24" fill="none"><path d="M4 19.5v-15A2.5 2.5 0 0 1 6.5 2H20v20H6.5a2.5 2.5 0 0 1-2.5-2.5ZM4 6h16M4 10h16M4 14h16" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
  const resetIcon = `<svg class="app-icon icon-refresh" viewBox="0 0 24 24" fill="none"><path d="M3 12a9 9 0 0 1 15.5-6.4L21 8M21 3v5h-5M21 12a9 9 0 0 1-15.5 6.4L3 16M3 21v-5h5" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>`;

  const availableDates = Object.keys(recentSharedSessions).sort((a, b) => b.localeCompare(a));

  if (currentPayload) {
    const totalRows = currentPayload.sheets?.reduce((s, sh) => s + (sh.rows || 0), 0) || 0;
    const currentSamplingDate = activeSessionDate || currentPayload?.metadata?.samplingDate || todaySamplingDate;

    let daySwitcherHtml = "";
    if (availableDates.length > 1) {
      daySwitcherHtml = `
        <div class="session-day-segmented" role="tablist" aria-label="Switch Sampling Day">
          ${availableDates.map((d, idx) => {
            const isSelected = (d === activeSessionDate || (!activeSessionDate && idx === 0));
            const weekday = formatWeekdayLabel(d);
            const isCurrent = d === todaySamplingDate;
            const label = isCurrent ? `${weekday} (Current)` : `${weekday} Sample`;
            return `<button type="button" class="session-day-btn ${isSelected ? "active" : ""}" data-switch-session-date="${escapeHtml(d)}" title="${escapeHtml(weekday)} Sample (${escapeHtml(d)})">
              <span>${escapeHtml(label)}</span>
            </button>`;
          }).join("")}
        </div>
      `;
    }

    el.innerHTML = `
      <div class="today-card-info">
        <div class="session-badge-wrap">
          <span class="session-badge">Active Sampling Session</span>
          ${daySwitcherHtml}
        </div>
        <strong class="session-title">${escapeHtml(formatWeekdayLabel(currentSamplingDate))} Sample</strong>
        <span class="session-meta">${totalRows.toLocaleString()} tickets analyzed &middot; 4 Auditors &middot; Shared Daily Session</span>
      </div>
      <div class="today-card-actions">
        <button type="button" class="primary-action" data-upload-new>${uploadIcon} <span>Upload New Workbook</span></button>
        <button type="button" class="secondary-action" data-open-library>${libraryIcon} <span>Worksheet Library</span></button>
        <button type="button" class="danger-btn-outline small" data-trigger-reset-workbook style="margin-left: 4px;">${resetIcon} <span>Reset Current Workbook</span></button>
      </div>
    `;
    return;
  }

  if (!manifest) {
    el.innerHTML = `
      <div class="today-card-info">
        <span class="session-badge">Sampling Session</span>
        <strong class="session-title">${escapeHtml(formatWeekdayLabel(todaySamplingDate))} Sample</strong>
        <span class="session-meta">No active shared session uploaded for ${escapeHtml(formatWeekdayLabel(todaySamplingDate))} yet. Upload a workbook to start sampling.</span>
      </div>
      <div class="today-card-actions">
        <button type="button" class="primary-action" data-upload-new>${uploadIcon} <span>Upload Worksheet</span></button>
        <button type="button" class="secondary-action" data-open-library>${libraryIcon} <span>Worksheet Library</span></button>
      </div>
    `;
    return;
  }

  el.innerHTML = `
    <div class="today-card-info">
      <span class="session-badge">Official Record</span>
      <strong class="session-title">${escapeHtml(formatWeekdayLabel(manifest.samplingDate))} Sample</strong>
      <span class="session-meta">${(manifest.totalWorkbookRows || 0).toLocaleString()} tickets analyzed &middot; ${manifest.sampledTicketCount || 0} sampled picks</span>
    </div>
    <div class="today-card-actions">
      <button type="button" class="primary-action" data-upload-new>${uploadIcon} <span>Upload New Workbook</span></button>
      <button type="button" class="secondary-action" data-open-library>${libraryIcon} <span>Worksheet Library</span></button>
    </div>
  `;
}

function renderHistoricalBanner() {
  const el = document.querySelector("#sessionBanner");
  if (!el) return;
  if (!viewingHistorical) {
    el.innerHTML = "";
    return;
  }
  const manifest = getDailyManifest(viewingHistorical.samplingDate);
  if (!manifest) {
    el.innerHTML = "";
    return;
  }
  el.innerHTML = `
    <div class="session-banner">
      <div>
        <strong>Viewing Historical Sampling Record</strong>
        <span>${escapeHtml(formatWeekdayLabel(manifest.samplingDate))} Sample &middot; ${escapeHtml(formatWorksheetDateLabel(manifest.samplingDate))} &middot; Week ${manifest.qaWeek}</span>
      </div>
      <div class="session-banner-actions">
        <button type="button" class="ops-action-inline" data-exit-historical>Back</button>
      </div>
    </div>
  `;
}

// Shared by "fresh upload" and active sessions - the only way a payload becomes active dataset.
function activatePayload(payload, statusText) {
  currentPayload = payload;
  reassignCurrentPayloadAuditors();
  currentChannel = "All";
  expandedAgent = null;
  document.querySelectorAll("[data-channel]").forEach((button) => {
    button.classList.toggle("active", button.dataset.channel === "All");
  });
  controlsEl.hidden = false;
  auditorTabsEl.hidden = false;
  const savedPref = localStorage.getItem("preferredAuditor");
  if (savedPref && (savedPref === "All" || AUDITORS.some((a) => a.name === savedPref))) {
    activeAuditor = savedPref;
  } else {
    activeAuditor = "All";
  }
  renderAuditorTabs();
  statusEl.textContent = statusText;
  render();
}

async function openHistoricalWorksheet(samplingDateKey) {
  const manifest = getDailyManifest(samplingDateKey);
  if (!manifest) return;

  // 1. Check if the full raw payload is in the active business-day session cache
  let session = recentSharedSessions[samplingDateKey];
  if (!session && typeof window !== "undefined" && window.location?.protocol?.startsWith("http")) {
    try {
      const res = await fetch(`/api/session/day?date=${encodeURIComponent(samplingDateKey)}`);
      if (res.ok) {
        const data = await res.json();
        if (data?.success && data?.session?.payload) {
          recentSharedSessions[samplingDateKey] = data.session;
          session = data.session;
        }
      }
    } catch (_) {}
  }

  // Case A: Full raw payload available in active business-day cache -> Open FULL interactive dashboard
  if (session?.payload) {
    closeOpsModal();
    activeSessionDate = samplingDateKey;
    if (session.manifest) recordDailyManifest(session.manifest);
    if (session.reqIntel) recordWorkbookRequirementIntelligence(session.reqIntel);
    viewingHistorical = { samplingDate: samplingDateKey };
    activatePayload(session.payload, `Viewing ${formatWeekdayLabel(samplingDateKey)} Sample.`);
    renderTodayCard();
    renderHistoricalBanner();
    return;
  }

  // Case B: Outside active business-day cache -> Fall back to compact sampled picks view
  const dayPicks = Object.values(samplerIntelligence).filter((t) => t.date === samplingDateKey);
  closeOpsModal();
  openHistoricalSampledModal(manifest, dayPicks);
}

function openHistoricalSampledModal(manifest, dayPicks) {
  document.querySelector("[data-historical-modal]")?.remove();
  const weekday = formatWeekdayLabel(manifest.samplingDate);
  const modal = document.createElement("div");
  modal.className = "modal-backdrop";
  modal.dataset.historicalModal = "true";

  const rows = dayPicks.length
    ? dayPicks
        .map((pick) => {
          const misses = getTicketMisses(pick);
          return `
            <tr>
              <td>${renderTicketLink(pick.id)}</td>
              <td>${escapeHtml(pick.agent)}</td>
              <td>${escapeHtml(pick.channel)}</td>
              <td>${escapeHtml(pick.subject || "-")}</td>
              <td>${escapeHtml(pick.module || "-")}</td>
              <td class="checks">
                ${misses.length ? misses.map((m) => `<span class="check-pill fail">&#10007; ${escapeHtml(m)}</span>`).join("") : `<span class="check-pill pass">&#10003; Clean</span>`}
              </td>
            </tr>
          `;
        })
        .join("")
    : `<tr><td colspan="6" class="empty">No picks were sampled/copied for this date.</td></tr>`;

  modal.innerHTML = `
    <section class="metric-modal" role="dialog" aria-modal="true" aria-label="Sampled Intelligence - ${escapeHtml(weekday)}">
      <header>
        <div>
          <strong>${escapeHtml(weekday)} Sample &middot; ${escapeHtml(formatWorksheetDateLabel(manifest.samplingDate))}</strong>
          <span>Uploaded by ${escapeHtml(manifest.uploader || "Unknown")} on ${escapeHtml(formatWorksheetDateLabel(manifest.uploadDate))} &middot; ${dayPicks.length} sampled picks</span>
        </div>
        <button type="button" data-close-modal>&times;</button>
      </header>
      <div class="modal-table-wrap">
        <table>
          <thead>
            <tr>
              <th>Ticket ID</th>
              <th>Agent</th>
              <th>Channel</th>
              <th>Subject</th>
              <th>Module</th>
              <th>Requirement Check</th>
            </tr>
          </thead>
          <tbody>${rows}</tbody>
        </table>
      </div>
    </section>
  `;
  document.body.appendChild(modal);
}

function exitHistoricalView() {
  viewingHistorical = null;
  renderHistoricalBanner();
  renderTodayCard();
}

// Confirms a Sampling Date for a freshly-parsed upload before it's saved.
// Defaults to the previous business day but lets the uploader override it,
// and refuses weekend dates outright (non-sampling days).
function openSamplingDateModal(defaultDateKey) {
  return new Promise((resolve) => {
    const modal = document.createElement("div");
    modal.className = "modal-backdrop";
    modal.dataset.samplingDateModal = "true";
    modal.innerHTML = `
      <section class="metric-modal" role="dialog" aria-modal="true" aria-label="Select Sampling Date">
        <header>
          <div>
            <strong>Select Sampling Date</strong>
            <span>Which business day do these tickets belong to?</span>
          </div>
        </header>
        <div class="modal-table-wrap">
          <input type="date" class="ops-input" data-sampling-date-input value="${escapeHtml(defaultDateKey)}" />
          <p class="sampling-date-weekday" data-sampling-date-weekday>${escapeHtml(formatWeekdayLabel(defaultDateKey))} Sample</p>
          <p class="sampling-date-warning" data-sampling-date-warning hidden>Saturday and Sunday are not sampling days - pick a weekday.</p>
        </div>
        <div class="assign-actions">
          <button type="button" class="primary-action" data-confirm-sampling-date>Continue</button>
          <button type="button" class="reject-btn" data-cancel-sampling-date>Cancel</button>
        </div>
      </section>
    `;
    document.body.appendChild(modal);
    const input = modal.querySelector("[data-sampling-date-input]");
    const weekdayLabel = modal.querySelector("[data-sampling-date-weekday]");
    const warning = modal.querySelector("[data-sampling-date-warning]");
    const confirmBtn = modal.querySelector("[data-confirm-sampling-date]");

    const refresh = () => {
      const key = input.value;
      const valid = /^\d{4}-\d{2}-\d{2}$/.test(key);
      const weekend = valid && isWeekendKey(key);
      weekdayLabel.textContent = valid ? `${formatWeekdayLabel(key)} Sample` : "";
      warning.hidden = !weekend;
      confirmBtn.disabled = !valid || weekend;
    };
    input.addEventListener("input", refresh);
    refresh();

    confirmBtn.addEventListener("click", () => {
      if (confirmBtn.disabled) return;
      modal.remove();
      resolve(input.value);
    });
    modal.querySelector("[data-cancel-sampling-date]").addEventListener("click", () => {
      modal.remove();
      resolve(null);
    });
  });
}

// Only shown when a worksheet already exists for the chosen Sampling Date.
function openWorksheetConflictModal(samplingDateKey) {
  return new Promise((resolve) => {
    const modal = document.createElement("div");
    modal.className = "modal-backdrop";
    modal.dataset.duplicateModal = "true";
    modal.innerHTML = `
      <section class="metric-modal" role="dialog" aria-modal="true" aria-label="Worksheet already exists">
        <header>
          <div>
            <strong>An official worksheet already exists for ${escapeHtml(formatWorksheetDateLabel(samplingDateKey))}.</strong>
          </div>
        </header>
        <div class="assign-actions">
          <button type="button" class="primary-action" data-replace-worksheet>Replace Official Worksheet</button>
          <button type="button" class="reject-btn" data-keep-worksheet>Cancel</button>
        </div>
      </section>
    `;
    document.body.appendChild(modal);
    modal.querySelector("[data-replace-worksheet]").addEventListener("click", () => {
      modal.remove();
      resolve("replace");
    });
    modal.querySelector("[data-keep-worksheet]").addEventListener("click", () => {
      modal.remove();
      resolve("cancel");
    });
  });
}


let libraryVisibleMonth = computeQaMonthKey(computeDefaultSamplingDate(todayDateKey()));

function shiftMonthKey(monthKey, delta) {
  const [year, month] = monthKey.split("-").map(Number);
  const date = new Date(year, month - 1 + delta, 1);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
}

function getBusinessDaysInMonth(monthKey) {
  const [year, month] = monthKey.split("-").map(Number);
  const days = [];
  const date = new Date(year, month - 1, 1);
  while (date.getMonth() === month - 1) {
    const key = dateToKey(date);
    if (!isWeekendKey(key)) days.push(key);
    date.setDate(date.getDate() + 1);
  }
  return days;
}


function openDeleteWorksheetConfirmModal(samplingDateKey) {
  const manifest = samplerDailyManifests[samplingDateKey];
  const weekday = formatWeekdayLabel(samplingDateKey);
  const dateLabel = formatWorksheetDateLabel(samplingDateKey);

  openOpsModal(
    "Delete Worksheet Record?",
    `Are you sure you want to delete the ${weekday} Sample record for ${dateLabel}?`,
    `
      <div style="padding: 16px 0;">
        <p style="margin-bottom: 12px; font-size: 13.5px; color: var(--text-secondary); line-height: 1.5;">
          This will permanently remove the official worksheet record, requirement intelligence, and sampled picks for <strong>${escapeHtml(dateLabel)}</strong> (${escapeHtml(weekday)} Sample).
        </p>
        <p style="margin-bottom: 18px; font-size: 12.5px; color: var(--color-danger); font-weight: 500;">
          This action cannot be undone.
        </p>
        <div class="assign-actions" style="justify-content: flex-end; gap: 10px;">
          <button type="button" class="secondary-action" data-cancel-delete-worksheet>Cancel</button>
          <button type="button" class="danger-btn-outline" data-confirm-delete-worksheet="${escapeHtml(samplingDateKey)}">Delete Worksheet</button>
        </div>
      </div>
    `
  );
}

function executeDeleteWorksheet(samplingDateKey) {
  triggerHapticPulse();
  const dateKey = normalizeDateKey(samplingDateKey);
  if (!dateKey) return;

  // 1. Delete official daily manifest
  if (samplerDailyManifests[dateKey]) {
    delete samplerDailyManifests[dateKey];
    safeStorageSetItem(SAMPLER_DAILY_MANIFEST_KEY, JSON.stringify(samplerDailyManifests));
  }

  // 2. Delete requirement intelligence
  if (workbookRequirementIntelligence[dateKey]) {
    delete workbookRequirementIntelligence[dateKey];
    safeStorageSetItem(WORKBOOK_REQUIREMENT_INTELLIGENCE_KEY, JSON.stringify(workbookRequirementIntelligence));
  }

  // 3. Delete sampled intelligence & copied picks for this date
  for (const [k, pick] of Object.entries(samplerIntelligence)) {
    if (normalizeDateKey(pick.date) === dateKey) {
      delete samplerIntelligence[k];
      copiedTickets.delete(k);
      copiedTickets.delete(pick.id || pick.ticketId);
    }
  }
  safeStorageSetItem(SAMPLER_INTELLIGENCE_KEY, JSON.stringify(samplerIntelligence));
  safeStorageSetItem("copiedTickets", JSON.stringify([...copiedTickets]));

  // 4. Delete the current active N-1 session data if it matches this date or if it is the active workbook
  const currentSamplingDate = normalizeDateKey(currentPayload?.metadata?.samplingDate);
  const todaySamplingDate = computeDefaultSamplingDate(todayDateKey());
  
  if (currentPayload && (currentSamplingDate === dateKey || (!currentSamplingDate && dateKey === todaySamplingDate))) {
    currentPayload = null;
    allTickets = [];
    viewingHistorical = null;
    rejectedTickets.clear();
    rejectedPatternCounts = {};
    safeStorageSetItem("rejectedTicketsV1", JSON.stringify([]));
    safeStorageSetItem("rejectedPatternCountsV1", JSON.stringify({}));
    
    statusEl.textContent = "Waiting for a daily sampling workbook.";
    controlsEl.hidden = true;
    auditorTabsEl.hidden = true;
    summaryEl.innerHTML = "";
    metricsEl.innerHTML = "";
    resultsEl.innerHTML = "";
    syncDailySessionResetToServer();
  }

  if (viewingHistorical?.samplingDate === dateKey) {
    viewingHistorical = null;
  }

  renderTodayCard();
  renderHistoricalBanner();
  openWorksheetLibraryModal();
}

function openWorksheetLibraryModal() {
  libraryVisibleMonth = computeQaMonthKey(computeDefaultSamplingDate(todayDateKey()));
  openOpsModal(
    "Worksheet Library",
    "Permanent archive of official worksheets, organized by Sampling Date.",
    renderWorksheetLibraryPanel(),
  );
}

function refreshWorksheetLibraryModal() {
  const body = document.querySelector(".ops-panel-body");
  if (body) body.innerHTML = renderWorksheetLibraryPanel();
}

function renderWorksheetLibraryPanel() {
  const monthKey = libraryVisibleMonth;
  const businessDays = getBusinessDaysInMonth(monthKey);
  const todaySamplingDate = computeDefaultSamplingDate(todayDateKey());
  const todayMonth = computeQaMonthKey(todaySamplingDate);

  const weeks = new Map();
  for (const dateKey of businessDays) {
    const week = computeQaWeekNumber(dateKey);
    if (!weeks.has(week)) weeks.set(week, []);
    weeks.get(week).push(dateKey);
  }

  // Only business days up to "today's" sampling reference count toward
  // readiness/missing-day detection - future weekdays just haven't happened
  // yet, they're not "missing".
  const isFutureMonth = monthKey > todayMonth;
  const countableDays = isFutureMonth ? [] : monthKey === todayMonth ? businessDays.filter((d) => d <= todaySamplingDate) : businessDays;
  const countableSet = new Set(countableDays);
  const uploadedCountableDays = countableDays.filter((d) => samplerDailyManifests[d]);
  const readinessPct = countableDays.length ? Math.round((uploadedCountableDays.length / countableDays.length) * 100) : 0;

  const weekSections = [...weeks.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([weekNumber, days]) => {
      const weekCountable = days.filter((d) => countableSet.has(d));
      const weekUploaded = weekCountable.filter((d) => samplerDailyManifests[d]);
      const weekPct = weekCountable.length ? Math.round((weekUploaded.length / weekCountable.length) * 100) : null;

      const dayCards = days
        .map((dateKey) => {
          const manifest = samplerDailyManifests[dateKey];
          const weekday = formatWeekdayLabel(dateKey);
          if (manifest) {
            const sampledCount = Object.values(samplerIntelligence).filter((t) => t.date === dateKey).length;
            const isFullDataAvailable = Boolean(recentSharedSessions[dateKey]);
            const availabilityBadge = isFullDataAvailable
              ? `<span class="library-status-pill full">Full Interactive Data</span>`
              : `<span class="library-status-pill compact">Compact Record</span>`;

            return `
              <div class="worksheet-day-card-wrap">
                <button type="button" class="worksheet-day-card has-data ${isFullDataAvailable ? "has-full-data" : ""}" data-open-historical="${dateKey}">
                  <div class="worksheet-day-card-header">
                    <strong>${escapeHtml(weekday)} Sample &#10003;</strong>
                    ${availabilityBadge}
                  </div>
                  <span>Sampling Date: ${escapeHtml(formatWorksheetDateLabel(dateKey))}</span>
                  <span>Uploaded: ${escapeHtml(formatWorksheetDateLabel(manifest.uploadDate))} &middot; ${escapeHtml(formatWorksheetTimeLabel(manifest.uploadedAt))}</span>
                  <span>${manifest.uploader ? `Uploader: ${escapeHtml(manifest.uploader)}` : "Uploader: Unknown"} &middot; ${(manifest.totalWorkbookRows || manifest.ticketCount || 0).toLocaleString()} tickets &middot; ${sampledCount} picks</span>
                </button>
                <div class="worksheet-card-actions">
                  <button type="button" class="worksheet-delete-btn" data-delete-worksheet="${dateKey}" title="Delete ${escapeHtml(weekday)} Sample record">
                    &times; Delete Worksheet
                  </button>
                </div>
              </div>
            `;
          }
          const isMissing = countableSet.has(dateKey);
          return `
            <div class="worksheet-day-card ${isMissing ? "missing" : "future"}">
              <strong>${escapeHtml(weekday)} Sample${isMissing ? " &#10007;" : ""}</strong>
              <span>${isMissing ? `${escapeHtml(weekday)} Sample has not been uploaded.` : "Not due yet"}</span>
            </div>
          `;
        })
        .join("");

      return `
        <section class="worksheet-week">
          <header>
            <strong>Week ${weekNumber}</strong>
            ${weekPct !== null ? `<span>${weekUploaded.length}/${weekCountable.length} uploaded &middot; ${weekPct}% complete</span>` : ""}
          </header>
          <div class="worksheet-week-days">${dayCards}</div>
        </section>
      `;
    })
    .join("");

  return `
    <div class="worksheet-library-nav">
      <button type="button" class="ops-action-inline" data-library-prev-month>&larr; Prev</button>
      <strong>${escapeHtml(formatMonthLabel(monthKey))}</strong>
      <button type="button" class="ops-action-inline" data-library-next-month>Next &rarr;</button>
    </div>
    <div class="worksheet-library-readiness">
      ${
        countableDays.length
          ? `${uploadedCountableDays.length} of ${countableDays.length} sampling days available &middot; ${readinessPct}% complete`
          : "No sampling days due yet this month."
      }
    </div>
    <div class="worksheet-library-weeks">${weekSections || `<div class="empty">No business days in this month.</div>`}</div>
    ${renderStorageHealthSection()}
  `;
}

function renderStorageHealthSection() {
  const metrics = getStorageUsageMetrics();
  const statusColor = metrics.isAboveThreshold ? "var(--color-danger)" : "var(--color-success)";
  const statusText = metrics.isAboveThreshold ? "Proactive Compaction Recommended (Usage >80%)" : "Optimal (Well within safety budget)";

  return `
    <div class="storage-health-card" style="margin-top: 24px; padding: 16px; background: var(--surface-secondary); border: 1px solid var(--separator-medium); border-radius: var(--radius-md);">
      <div style="display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 10px;">
        <div>
          <strong style="font-size: 13px; color: var(--text-primary); display: flex; align-items: center; gap: 6px;">
            <span style="display: inline-block; width: 8px; height: 8px; border-radius: 50%; background: ${statusColor};"></span>
            Persistent Storage Health & Diagnostics
          </strong>
          <span style="display: block; font-size: 12px; color: var(--text-secondary); margin-top: 2px;">
            Browser LocalStorage Quota Budget: ${metrics.budgetMb} MB &middot; Currently Used: <strong>${metrics.totalMb} MB</strong> (${metrics.usagePercent}%)
          </span>
        </div>
        <button type="button" class="ops-action-inline" data-storage-action="run-compaction" style="padding: 6px 12px; font-size: 12px; border-radius: var(--radius-pill);">
          Run Proactive Compaction
        </button>
      </div>
      <div style="background: var(--color-surface-tertiary); height: 6px; border-radius: 9999px; margin: 12px 0; overflow: hidden;">
        <div style="width: ${Math.min(100, Math.max(2, metrics.usagePercent))}%; background: ${metrics.usagePercent > 80 ? "var(--color-danger)" : "linear-gradient(90deg, var(--ios-teal) 0%, var(--ios-blue) 100%)"}; height: 100%; border-radius: 9999px; transition: width 0.3s ease;"></div>
      </div>
      <div style="display: flex; justify-content: space-between; font-size: 11px; color: var(--text-tertiary); flex-wrap: wrap; gap: 6px;">
        <span>Status: <strong style="color: ${statusColor};">${statusText}</strong></span>
        <span>Requirement Intel: ${metrics.keyBreakdown.workbookRequirementIntelligenceV1?.kb || "0"} KB &middot; Copied Samples: ${metrics.keyBreakdown.samplerIntelligenceV1?.kb || "0"} KB &middot; Manifests: ${metrics.keyBreakdown.samplerDailyManifestV1?.kb || "0"} KB</span>
      </div>
    </div>
  `;
}

function openAssignAgentsModal() {
  openOpsModal(
    "Assign Agents",
    "Move an agent to a different auditor, or mark them Active/Inactive. Saved on this device and applied immediately.",
    renderAssignAgentsPanel(),
  );
}

function refreshAssignAgentsPanel() {
  const body = document.querySelector(".ops-panel-body");
  if (body) body.innerHTML = renderAssignAgentsPanel();
}

// ================= Add Agent (Phase 3B) =================
function normalizeAgentNameForDuplicateCheck(name) {
  return clean(name).toLowerCase().replace(/\s+/g, " ");
}

function findExistingAgentName(name) {
  const target = normalizeAgentNameForDuplicateCheck(name);
  if (!target) return null;
  return Object.keys(agentAssignments).find((existing) => normalizeAgentNameForDuplicateCheck(existing) === target) || null;
}

function openAddAgentModal() {
  closeAddAgentModal();
  const modal = document.createElement("div");
  modal.className = "modal-backdrop";
  modal.dataset.addAgentModal = "true";
  modal.innerHTML = `
    <section class="metric-modal add-agent-modal" role="dialog" aria-modal="true" aria-label="Add Agent">
      <header>
        <div>
          <strong>Add Agent</strong>
          <span>New agents are saved as Active immediately.</span>
        </div>
        <button type="button" data-close-add-agent aria-label="Close">&times;</button>
      </header>
      <div class="ops-panel-body">
        <div class="add-agent-form">
          <label>
            Agent Name
            <input type="text" class="ops-input" data-add-agent-name placeholder="Full name" autocomplete="off" />
          </label>
          <label>
            Assigned Auditor
            <select class="ops-input" data-add-agent-auditor>
              ${AUDITOR_NAMES.map((name) => `<option value="${escapeHtml(name)}">${escapeHtml(name)}</option>`).join("")}
            </select>
          </label>
          <div class="add-agent-error" data-add-agent-error hidden>Agent already exists.</div>
        </div>
        <div class="assign-actions">
          <button type="button" class="reject-btn" data-close-add-agent>Cancel</button>
          <button type="button" class="primary-action" data-add-agent-submit disabled>Add Agent</button>
        </div>
      </div>
    </section>
  `;
  document.body.appendChild(modal);
  modal.querySelector("[data-add-agent-name]").focus();
}

function closeAddAgentModal() {
  document.querySelector("[data-add-agent-modal]")?.remove();
}

function validateAddAgentForm() {
  const modal = document.querySelector("[data-add-agent-modal]");
  if (!modal) return;
  const name = clean(modal.querySelector("[data-add-agent-name]").value);
  const errorEl = modal.querySelector("[data-add-agent-error]");
  const submitBtn = modal.querySelector("[data-add-agent-submit]");
  const duplicate = name ? findExistingAgentName(name) : null;
  errorEl.hidden = !duplicate;
  submitBtn.disabled = !name || !!duplicate;
}

// Adds the agent locally first (instant UI update, no page refresh needed
// for the person adding it), then pushes to Firestore best-effort and logs
// the addition to assignment history the same way a reassignment would.
function submitAddAgentForm() {
  const modal = document.querySelector("[data-add-agent-modal]");
  if (!modal) return;
  const nameInput = modal.querySelector("[data-add-agent-name]");
  const auditorSelect = modal.querySelector("[data-add-agent-auditor]");
  const name = clean(nameInput.value);
  if (!name || findExistingAgentName(name)) {
    validateAddAgentForm();
    return;
  }
  const auditor = auditorSelect.value;
  const nowIso = new Date().toISOString();

  agentAssignments = { ...agentAssignments, [name]: auditor };
  saveAgentAssignments();
  recomputeAgentAuditorMaps();
  reassignCurrentPayloadAuditors();
  if (!AUDITORS.some((entry) => entry.name === activeAuditor)) activeAuditor = AUDITORS[0]?.name || null;
  renderAuditorTabs();
  render();

  pushAgentsToFirestore([name], { [name]: { createdAt: nowIso } });
  logAssignmentHistory({ agent: name, from: "(none)", to: auditor, action: "Added" });

  closeAddAgentModal();
  refreshAssignAgentsPanel();
}

// ================= Rename Agent =================
function renameAgent(oldName, newName) {
  const oldClean = clean(oldName);
  const newClean = clean(newName);
  if (!oldClean || !newClean || oldClean === newClean) return false;

  // Check for collision against another existing agent (excluding oldName)
  const existing = findExistingAgentName(newClean);
  if (existing && normalizeName(existing) !== normalizeName(oldClean)) {
    return false;
  }

  const auditor = agentAssignments[oldClean] || AUDITOR_NAMES[0];
  const isActive = isAgentActive(oldClean);

  // 1. Update agentAssignments map
  delete agentAssignments[oldClean];
  agentAssignments[newClean] = auditor;
  saveAgentAssignments();

  // 2. Update agentStatus map
  if (agentStatus[oldClean] !== undefined) {
    agentStatus[newClean] = agentStatus[oldClean];
    delete agentStatus[oldClean];
    saveAgentStatus();
  }

  // 3. Register oldName as alias of newName for future N-1 uploads
  addAgentAlias(oldClean, newClean);

  // 4. Update existing samplerIntelligence records in place
  let intelChanged = false;
  for (const ticket of Object.values(samplerIntelligence)) {
    if (ticket.agent === oldClean) {
      ticket.agent = newClean;
      intelChanged = true;
    }
  }
  if (intelChanged) saveSamplerIntelligence();

  // 5. Update existing workbookRequirementIntelligence records in place
  let popChanged = false;
  for (const rec of Object.values(workbookRequirementIntelligence)) {
    if (rec.agents && rec.agents[oldClean]) {
      rec.agents[newClean] = rec.agents[oldClean];
      rec.agents[newClean].agent = newClean;
      delete rec.agents[oldClean];
      popChanged = true;
    }
  }
  if (popChanged) saveWorkbookRequirementIntelligence();

  // 6. Update watchlist snapshots
  let watchChanged = false;
  for (const item of watchlistItems) {
    if (item.snapshot?.agent === oldClean) {
      item.snapshot.agent = newClean;
      watchChanged = true;
    }
    if (item.assignee === oldClean) {
      item.assignee = newClean;
      watchChanged = true;
    }
  }
  if (watchChanged) saveWatchlist();

  // 7. Update active currentPayload in memory
  if (currentPayload && currentPayload.agents) {
    for (const group of currentPayload.agents) {
      if (group.agent === oldClean) {
        group.agent = newClean;
        for (const t of group.tickets || []) {
          t.agent = newClean;
        }
      }
    }
  }

  // 8. Recompute lookups and refresh views
  recomputeAgentAuditorMaps();
  reassignCurrentPayloadAuditors();
  if (!AUDITORS.some((entry) => entry.name === activeAuditor)) {
    activeAuditor = AUDITORS[0]?.name || null;
  }

  logAssignmentHistory({
    agent: newClean,
    from: `${oldClean} (${auditor})`,
    to: `${newClean} (${auditor})`,
    action: "Renamed",
  });

  pushAgentsToFirestore([newClean]);

  renderAuditorTabs();
  render();
  refreshAssignAgentsPanel();
  return true;
}

function openRenameAgentModal(agentName) {
  closeRenameAgentModal();
  const modal = document.createElement("div");
  modal.className = "modal-backdrop";
  modal.dataset.renameAgentModal = "true";
  modal.innerHTML = `
    <section class="metric-modal rename-agent-modal" role="dialog" aria-modal="true" aria-label="Rename Agent">
      <header>
        <div>
          <strong>Rename Agent</strong>
          <span>Update agent name across all historical records, samples, and intelligence.</span>
        </div>
        <button type="button" data-close-rename-agent aria-label="Close">&times;</button>
      </header>
      <div class="ops-panel-body">
        <div class="add-agent-form">
          <label>
            Current Name
            <input type="text" class="ops-input" value="${escapeHtml(agentName)}" disabled />
          </label>
          <label>
            New Agent Name
            <input type="text" class="ops-input" data-rename-agent-input data-old-agent="${escapeHtml(agentName)}" value="${escapeHtml(agentName)}" autocomplete="off" />
          </label>
          <div class="add-agent-error" data-rename-agent-error hidden>An agent with this name already exists.</div>
          <p class="muted" style="font-size: 12px; margin-top: 6px;">
            Renaming updates active sampling, historical sampled picks, and workbook requirement intelligence, and maps the old name as an alias for future uploads.
          </p>
        </div>
        <div class="assign-actions">
          <button type="button" class="reject-btn" data-close-rename-agent>Cancel</button>
          <button type="button" class="primary-action" data-rename-agent-submit disabled>Rename Agent</button>
        </div>
      </div>
    </section>
  `;
  document.body.appendChild(modal);
  const input = modal.querySelector("[data-rename-agent-input]");
  input.focus();
  input.select();
}

function closeRenameAgentModal() {
  document.querySelector("[data-rename-agent-modal]")?.remove();
}

function validateRenameAgentForm() {
  const modal = document.querySelector("[data-rename-agent-modal]");
  if (!modal) return;
  const input = modal.querySelector("[data-rename-agent-input]");
  const oldName = clean(input.dataset.oldAgent);
  const newName = clean(input.value);
  const errorEl = modal.querySelector("[data-rename-agent-error]");
  const submitBtn = modal.querySelector("[data-rename-agent-submit]");

  const duplicate = newName && normalizeName(newName) !== normalizeName(oldName) ? findExistingAgentName(newName) : null;
  errorEl.hidden = !duplicate;
  submitBtn.disabled = !newName || newName === oldName || !!duplicate;
}

function submitRenameAgentForm() {
  const modal = document.querySelector("[data-rename-agent-modal]");
  if (!modal) return;
  const input = modal.querySelector("[data-rename-agent-input]");
  const oldName = clean(input.dataset.oldAgent);
  const newName = clean(input.value);

  if (!oldName || !newName || oldName === newName) {
    validateRenameAgentForm();
    return;
  }
  const duplicate = findExistingAgentName(newName);
  if (duplicate && normalizeName(duplicate) !== normalizeName(oldName)) {
    validateRenameAgentForm();
    return;
  }

  const success = renameAgent(oldName, newName);
  if (success) {
    closeRenameAgentModal();
  }
}

function renderAgentAssignRow(agent) {
  const currentAuditor = agentAssignments[agent];
  const active = isAgentActive(agent);
  const options = AUDITOR_NAMES.map(
    (name) => `<option value="${escapeHtml(name)}" ${name === currentAuditor ? "selected" : ""}>${escapeHtml(name)}</option>`,
  ).join("");
  return `
    <tr class="${active ? "" : "agent-row-inactive"}">
      <td>
        <span class="status-dot ${active ? "status-dot-active" : "status-dot-inactive"}" aria-hidden="true"></span>
        ${escapeHtml(agent)}
      </td>
      <td>
        <select class="ops-input assign-select" data-assign-agent="${escapeHtml(agent)}">
          ${options}
        </select>
      </td>
      <td>
        <div style="display: flex; gap: 6px; align-items: center;">
          <button type="button" class="ops-action-inline" data-rename-agent="${escapeHtml(agent)}">Rename</button>
          ${
            active
              ? `<button type="button" class="ops-action-inline" data-mark-inactive="${escapeHtml(agent)}">Mark Inactive</button>`
              : `<button type="button" class="ops-action-inline" data-reactivate="${escapeHtml(agent)}">Reactivate</button>`
          }
        </div>
      </td>
    </tr>
  `;
}

function renderAssignAgentsPanel() {
  const allAgents = Object.keys(agentAssignments).sort((a, b) => a.localeCompare(b));
  const activeAgentsList = allAgents.filter((agent) => isAgentActive(agent));
  const inactiveAgentsList = allAgents.filter((agent) => !isAgentActive(agent));

  const activeRows = activeAgentsList.map(renderAgentAssignRow).join("");
  const inactiveRows = inactiveAgentsList.map(renderAgentAssignRow).join("");

  return `
    <div class="assign-panel-header">
      <strong>Agents (${allAgents.length})</strong>
      <button type="button" class="assign-add-btn" data-add-agent-trigger title="Add New Agent" aria-label="Add New Agent">
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><path d="M12 5v14M5 12h14"/></svg>
        <span>Add Agent</span>
      </button>
    </div>
    <div class="modal-table-wrap assign-table">
      <table>
        <thead>
          <tr>
            <th>Agent</th>
            <th>Auditor</th>
            <th>Status</th>
          </tr>
        </thead>
        <tbody>
          ${activeRows}
          ${
            inactiveAgentsList.length
              ? `<tr class="assign-section-row"><td colspan="3">Inactive</td></tr>${inactiveRows}`
              : ""
          }
        </tbody>
      </table>
    </div>
    <div class="assign-actions">
      <button class="primary-action" type="button" data-assign-save>Save assignments</button>
      <button class="reject-btn" type="button" data-assign-reset>Reset to default roster</button>
    </div>
    ${renderAssignHistoryDetails()}
  `;
}

// Deliberately minimal, collapsed by default - this is a rarely-used
// secondary view, not a primary feature. Last 20 changes only.
let assignHistorySearch = "";
let assignHistoryAuditorFilter = "All";

function renderAssignHistoryDetails() {
  return `
    <details class="assign-history-details">
      <summary>Assignment History</summary>
      <div class="assign-history-toolbar">
        <input type="text" class="ops-input" placeholder="Search by agent..." data-history-search value="${escapeHtml(assignHistorySearch)}" />
        <select class="ops-input" data-history-auditor-filter>
          ${["All", ...AUDITOR_NAMES]
            .map((name) => `<option value="${escapeHtml(name)}" ${name === assignHistoryAuditorFilter ? "selected" : ""}>${escapeHtml(name)}</option>`)
            .join("")}
        </select>
        <button type="button" class="ops-action-inline" data-history-export>Export CSV</button>
        <button type="button" class="ops-action-inline" data-history-clear>Clear history</button>
      </div>
      <div class="modal-table-wrap assign-history-table">
        <table>
          <thead>
            <tr>
              <th>Timestamp</th>
              <th>Agent</th>
              <th>Change</th>
              <th>Action</th>
              <th>Changed By</th>
            </tr>
          </thead>
          <tbody>${renderAssignHistoryRows()}</tbody>
        </table>
      </div>
    </details>
  `;
}

function renderAssignHistoryRows() {
  const query = assignHistorySearch.trim().toLowerCase();
  const rows = assignmentHistory
    .filter((item) => !query || item.agent.toLowerCase().includes(query))
    .filter(
      (item) => assignHistoryAuditorFilter === "All" || item.from === assignHistoryAuditorFilter || item.to === assignHistoryAuditorFilter,
    );
  if (!rows.length) return `<tr><td colspan="5" class="empty">No assignment history yet.</td></tr>`;
  return rows
    .map(
      (item) => `
      <tr>
        <td>${escapeHtml(formatDateTime(item.timestamp))}</td>
        <td>${escapeHtml(item.agent)}</td>
        <td>${escapeHtml(item.from)} &rarr; ${escapeHtml(item.to)}</td>
        <td>${escapeHtml(item.action)}</td>
        <td>${escapeHtml(item.changedBy || "Unknown")}</td>
      </tr>`,
    )
    .join("");
}

function refreshAssignHistoryTable() {
  const tbody = document.querySelector(".assign-history-table tbody");
  if (tbody) tbody.innerHTML = renderAssignHistoryRows();
}

function exportAssignmentHistoryCsv() {
  const header = "Timestamp,Agent,Previous Auditor,New Auditor,Action,Changed By";
  const lines = assignmentHistory.map((item) =>
    [item.timestamp, item.agent, item.from, item.to, item.action, item.changedBy || "Unknown"]
      .map((value) => `"${String(value).replace(/"/g, '""')}"`)
      .join(","),
  );
  downloadTextFile("assignment-history.csv", "text/csv", [header, ...lines].join("\n"));
}

function downloadTextFile(filename, mime, text) {
  const blob = new Blob([text], { type: mime });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function clearAssignmentHistory() {
  if (!confirm("Clear all assignment history? This cannot be undone.")) return;
  assignmentHistory = [];
  saveAssignmentHistory();
  refreshAssignHistoryTable();
}

function saveAgentAssignmentsFromModal() {
  const selects = [...document.querySelectorAll("[data-assign-agent]")];
  const newAssignments = { ...agentAssignments };
  for (const select of selects) {
    newAssignments[select.dataset.assignAgent] = select.value;
  }
  commitAgentAssignments(newAssignments);
  closeOpsModal();
}


const AUDIT_SHEETS = [
  "https://docs.google.com/spreadsheets/d/1vQmz1N1YNAepVOBV33DjFD9uSWDkMGFpg2z9edBI-tE/edit?usp=chrome_ntp&ouid=112088698588185722807",
  "https://docs.google.com/spreadsheets/d/1onHI3pjujH0g509gKngMKBO3z70D0DkLWlMVdEMkJ80/edit?gid=1289068805#gid=1289068805",
];
const FIRSTLINE_URL = "https://firstline.carestack.com/#/conversations";

// Set to true to log every merged ticket (rows merged + tags merged) to the
// browser console. Safe to flip back to false at any time - it only affects
// console.log output, not scoring, ranking, or any stored data.
const DEBUG_DEDUP = false;

// Column names Zendesk has used for the tag list. Matched case-insensitively.
const TAG_COLUMN_NAMES = new Set(["tags", "tag", "ticket tags"]);

// Tag-based sampling parameters (Feature: only 2 wired in for now - more later).
// Matched with fuzzy search (normalized + edit-distance tolerant) rather than
// exact string equality, since Zendesk's tag spelling has drifted before.
const MERGE_TICKET_TAG = "closed_by_merge";
const JIRA_TICKET_TAG = "jira_escalated";
const JIRA_REQUIRED_TYPES = new Set(["incident / system error", "feature request", "clarifications"]);
const BAD_CSAT_TAG = "bad_csat";

function normalizeTagForFuzzy(value) {
  return clean(value).toLowerCase().replace(/[^a-z0-9]/g, "");
}

function levenshteinDistance(a, b) {
  const rows = a.length + 1;
  const cols = b.length + 1;
  const dist = Array.from({ length: rows }, (_, i) => [i, ...Array(cols - 1).fill(0)]);
  for (let j = 0; j < cols; j += 1) dist[0][j] = j;
  for (let i = 1; i < rows; i += 1) {
    for (let j = 1; j < cols; j += 1) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      dist[i][j] = Math.min(dist[i - 1][j] + 1, dist[i][j - 1] + 1, dist[i - 1][j - 1] + cost);
    }
  }
  return dist[rows - 1][cols - 1];
}

// Fuzzy-matches a raw worksheet tag against a target tag name. Exact and
// substring matches always pass; otherwise a small edit-distance tolerance
// (scaled to the target's length) covers minor spelling drift.
function fuzzyTagMatches(rawTag, targetTag) {
  const a = normalizeTagForFuzzy(rawTag);
  const b = normalizeTagForFuzzy(targetTag);
  if (!a || !b) return false;
  if (a === b || a.includes(b) || b.includes(a)) return true;
  const maxDistance = Math.max(1, Math.floor(b.length * 0.2));
  return levenshteinDistance(a, b) <= maxDistance;
}

function findTagColumnKey(row) {
  return Object.keys(row).find((key) => TAG_COLUMN_NAMES.has(key.trim().toLowerCase())) || null;
}

function parseTagTokens(value) {
  const text = clean(value).toLowerCase();
  if (!text) return [];
  return [...new Set(text.split(/[,;|]/).map((tag) => tag.trim()).filter(Boolean))];
}

// Merges a duplicate-tag-row (`newRow`) for the same ticket into the
// already-kept row (`existingRow`), mutating `existingRow` in place.
//   - The tag column (Tags / Tag / Ticket tags) is combined into a
//     deduplicated, sorted, comma-separated list.
//   - Every other field keeps the first non-empty value already present in
//     `existingRow`; blanks in `existingRow` get backfilled from `newRow`.
function mergeDuplicateTicketRow(existingRow, newRow) {
  const tagKey = findTagColumnKey(existingRow) || findTagColumnKey(newRow);
  if (tagKey) {
    const mergedTags = new Set([...parseTagTokens(existingRow[tagKey]), ...parseTagTokens(newRow[tagKey])]);
    existingRow[tagKey] = [...mergedTags].sort().join(", ");
  }
  for (const [key, value] of Object.entries(newRow)) {
    if (key === tagKey) continue;
    if (isBlank(existingRow[key]) && !isBlank(value)) {
      existingRow[key] = value;
    }
  }
}

const fileInput = document.querySelector("#fileInput");
const statusEl = document.querySelector("#status");
const controlsEl = document.querySelector("#controls");
const copyIdealBtn = document.querySelector("#copyIdeal");
const auditorTabsEl = document.querySelector("#auditorTabs");
const summaryEl = document.querySelector("#summary");
const metricsEl = document.querySelector("#metrics");
const resultsEl = document.querySelector("#results");
const opsToggleBtn = document.querySelector("#opsToggle");
const opsMenuEl = document.querySelector("#opsMenu");
const opsBackdropEl = document.querySelector("#opsBackdrop");

var currentPayload = null;
let currentChannel = "All";
var activeAuditor = localStorage.getItem("preferredAuditor") || "All";
let expandedAgent = null;
let copiedTickets = new Set(JSON.parse(localStorage.getItem("copiedTickets") || "[]"));
let watchlistItems = loadWatchlist();
let rejectedTickets = new Set(JSON.parse(localStorage.getItem("rejectedTicketsV1") || "[]"));
let rejectedPatternCounts = JSON.parse(localStorage.getItem("rejectedPatternCountsV1") || "{}");
let opsMenuOpen = false;
let opsMenuCloseTimer = null;

fileInput.addEventListener("change", async () => {
  const file = fileInput.files?.[0];
  if (!file) return;
  await analyzeSelectedFile(file);
});

opsToggleBtn?.addEventListener("click", () => {
  triggerHapticPulse();
  setOpsMenuOpen(!opsMenuOpen);
});

// Animating a menu that's `display: none` isn't possible, so the `hidden`
// attribute is only ever applied once the closing transition has finished -
// while open (and mid-transition either way) the element stays in the DOM
// with opacity/transform driving the actual show/hide.
function setOpsMenuOpen(open) {
  if (!opsMenuEl || !opsToggleBtn) return;
  opsMenuOpen = open;
  window.clearTimeout(opsMenuCloseTimer);

  if (open) {
    opsMenuEl.hidden = false;
    if (opsBackdropEl) opsBackdropEl.hidden = false;
    // Force a layout flush so the browser animates from the closed state
    // instead of jumping straight to "open" (removing `hidden` and adding
    // the class in the same tick would otherwise skip the transition).
    void opsMenuEl.offsetWidth;
    opsMenuEl.classList.add("open");
    opsBackdropEl?.classList.add("open");
  } else {
    opsMenuEl.classList.remove("open");
    opsBackdropEl?.classList.remove("open");
    opsMenuCloseTimer = window.setTimeout(() => {
      opsMenuEl.hidden = true;
      if (opsBackdropEl) opsBackdropEl.hidden = true;
    }, 240);
  }

  opsMenuEl.setAttribute("aria-hidden", String(!open));
  opsToggleBtn.setAttribute("aria-expanded", String(open));
  opsToggleBtn.classList.toggle("active", open);
  if (open) {
    opsMenuEl.querySelector(".ops-action")?.focus();
  }
}

document.addEventListener("click", (event) => {
  if (!opsMenuEl || opsMenuEl.getAttribute("aria-hidden") !== "false") return;
  if (event.target.closest("#opsMenu") || event.target.closest("#opsToggle")) return;
  setOpsMenuOpen(false);
});

document.addEventListener("keydown", (event) => {
  if (event.key !== "Escape") return;
  if (opsMenuEl && opsMenuEl.getAttribute("aria-hidden") === "false") {
    setOpsMenuOpen(false);
    opsToggleBtn?.focus();
  }
});

opsMenuEl?.addEventListener("keydown", (event) => {
  if (event.key !== "ArrowDown" && event.key !== "ArrowUp") return;
  const items = [...opsMenuEl.querySelectorAll(".ops-action")];
  const currentIndex = items.indexOf(document.activeElement);
  if (currentIndex === -1) return;
  event.preventDefault();
  const nextIndex = event.key === "ArrowDown" ? (currentIndex + 1) % items.length : (currentIndex - 1 + items.length) % items.length;
  items[nextIndex].focus();
});

async function analyzeSelectedFile(file) {
  statusEl.textContent = `Analyzing ${file.name}...`;
  controlsEl.hidden = true;
  auditorTabsEl.hidden = true;
  summaryEl.innerHTML = "";
  metricsEl.innerHTML = "";
  resultsEl.innerHTML = "";

  try {
    const buffer = await readUploadedWorkbook(file);
    const payload = await analyzeWorkbook(buffer);
    const meta = computeWorkbookFingerprint(payload);
    const uploadDateKey = todayDateKey();

    // The user picks Sampling Date explicitly (defaulted to the previous
    // business day) - everything else about the record is automatic.
    const defaultSamplingDate = computeDefaultSamplingDate(uploadDateKey);
    const samplingDateKey = await openSamplingDateModal(defaultSamplingDate);
    if (!samplingDateKey) {
      statusEl.textContent = "Upload cancelled - no changes made.";
      renderTodayCard();
      return;
    }

    // One official worksheet per Sampling Date - ask before overwriting.
    if (samplerDailyManifests[samplingDateKey]) {
      const decision = await openWorksheetConflictModal(samplingDateKey);
      if (decision !== "replace") {
        statusEl.textContent = "Upload cancelled - kept the existing official worksheet record.";
        renderTodayCard();
        return;
      }
    }

    const uploaderName = promptForUploaderName();
    const manifest = {
      samplingDate: samplingDateKey,
      uploadDate: uploadDateKey,
      uploadedAt: new Date().toISOString(),
      uploader: uploaderName,
      workbookName: file.name,
      totalWorkbookRows: meta.ticketCount,
      eligibleTicketCount: countEligibleTickets(payload),
      sampledTicketCount: 0,
      fingerprint: meta.fingerprint,
      qaWeek: computeQaWeekNumber(samplingDateKey),
      qaMonth: computeQaMonthKey(samplingDateKey),
    };
    recordDailyManifest(manifest);

    const reqIntel = aggregateWorkbookRequirementIntelligence(payload, samplingDateKey);
    recordWorkbookRequirementIntelligence(reqIntel);

    viewingHistorical = null;
    activatePayload(payload, `Done. ${formatWeekdayLabel(samplingDateKey)} Sample loaded for active sampling.`);
    syncDailySessionToServer(payload, manifest, reqIntel);
    renderTodayCard();
    renderHistoricalBanner();
  } catch (error) {
    statusEl.textContent = `Could not analyze workbook: ${getFriendlyFileError(error)}`;
  }
}

async function readUploadedWorkbook(file) {
  try {
    return await file.arrayBuffer();
  } catch {
    return await new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = () => reject(reader.error || new Error("The browser blocked access to this file."));
      reader.readAsArrayBuffer(file);
    });
  }
}

function getFriendlyFileError(error) {
  const message = error?.message || String(error);
  if (/permission|read|acquired|not found|blocked/i.test(message)) {
    return "The browser could not read that Excel file. Do not open the app inside Teams preview. Download the HTML, open it in Chrome/Edge, close the Excel file if it is open, then choose the workbook again.";
  }
  return message;
}

document.querySelectorAll("[data-channel]").forEach((button) => {
  button.addEventListener("click", () => {
    currentChannel = button.dataset.channel;
    document.querySelectorAll("[data-channel]").forEach((item) => {
      item.classList.toggle("active", item === button);
    });
    render();
  });
});

function renderAuditorTabs() {
  const allTab = `
    <button class="${activeAuditor === "All" ? "active" : ""}" type="button" data-auditor="All">
      All Agents
    </button>
  `;
  auditorTabsEl.innerHTML = allTab + AUDITORS.map(
    (auditor) => `
      <button class="${auditor.name === activeAuditor ? "active" : ""}" type="button" data-auditor="${escapeHtml(auditor.name)}">
        ${escapeHtml(auditor.name)}
      </button>
    `,
  ).join("");
}

auditorTabsEl.addEventListener("click", (event) => {
  const button = event.target.closest("[data-auditor]");
  if (!button) return;
  activeAuditor = button.dataset.auditor;
  safeStorageSetItem("preferredAuditor", activeAuditor);
  renderAuditorTabs();
  render();
});

copyIdealBtn.addEventListener("click", async () => {
  if (!currentPayload) return;
  const picks = getActiveAgents()
    .map((agent) => getDisplayTickets(agent).picks[0])
    .filter(Boolean);

  if (!picks.length) return;
  const rows = picks.map(copyRow);
  await copyText(rows.join("\n"));
  picks.forEach((pick) => {
    const k = getSampleKey(pick.channel, pick.ticketId);
    copiedTickets.add(k);
    copiedTickets.add(String(pick.ticketId));
  });
  persistCopiedTickets();
  recordSampledTickets(picks);
  copyIdealBtn.textContent = "Copied Ideals";
  setTimeout(() => {
    copyIdealBtn.textContent = "Copy All Ideal Picks";
  }, 1200);
  render();
});

document.addEventListener("click", async (event) => {
  const switchDateBtn = event.target.closest("[data-switch-session-date]");
  if (switchDateBtn) {
    const targetDate = switchDateBtn.dataset.switchSessionDate;
    if (targetDate && targetDate !== activeSessionDate) {
      triggerHapticPulse();
      switchActiveDailySession(targetDate);
    }
    return;
  }

  const openToday = event.target.closest("[data-open-today]");
  if (openToday) {
    openWorksheetLibraryModal();
    return;
  }

  const uploadNew = event.target.closest("[data-upload-new]");
  if (uploadNew) {
    fileInput.click();
    return;
  }

  const openLibrary = event.target.closest("[data-open-library]");
  if (openLibrary) {
    openWorksheetLibraryModal();
    return;
  }

  const exitHistorical = event.target.closest("[data-exit-historical]");
  if (exitHistorical) {
    exitHistoricalView();
    return;
  }


  const triggerResetWb = event.target.closest("[data-trigger-reset-workbook]");
  if (triggerResetWb) {
    openResetWorkbookConfirmModal();
    return;
  }

  const confirmResetWb = event.target.closest("[data-confirm-reset-workbook]");
  if (confirmResetWb) {
    executeResetCurrentWorkbook();
    return;
  }

  const triggerFlushN1 = event.target.closest("[data-trigger-flush-n1]");
  if (triggerFlushN1) {
    openFlushN1ConfirmModal();
    return;
  }

  const confirmFlushN1 = event.target.closest("[data-confirm-flush-n1]");
  if (confirmFlushN1) {
    executeFlushLocalN1Data();
    return;
  }

  const aiPeriodBtn = event.target.closest("[data-ai-period-action]");
  if (aiPeriodBtn) {
    handleAiPeriodStep(aiPeriodBtn.dataset.aiPeriodAction);
    refreshAnalyticsHubPanel();
    return;
  }

  const agentReqPopoverBtn = event.target.closest("[data-agent-req-popover]");
  if (agentReqPopoverBtn) {
    openAgentReqPopover(agentReqPopoverBtn.dataset.agentReqPopover, agentReqPopoverBtn.dataset.missName);
    return;
  }

  const openHighImpactBtn = event.target.closest("[data-open-high-impact]");
  if (openHighImpactBtn && !openHighImpactBtn.disabled) {
    openHighImpactModal(openHighImpactBtn.dataset.openHighImpact);
    return;
  }

  const closePopoverBtn = event.target.closest("[data-close-popover], [data-close-popover-backdrop]");
  if (closePopoverBtn) {
    activeTicketPopover = null;
    refreshAnalyticsHubPanel();
    return;
  }

  const deleteWorksheetBtn = event.target.closest("[data-delete-worksheet]");
  if (deleteWorksheetBtn) {
    event.stopPropagation();
    openDeleteWorksheetConfirmModal(deleteWorksheetBtn.dataset.deleteWorksheet);
    return;
  }

  const confirmDeleteWbBtn = event.target.closest("[data-confirm-delete-worksheet]");
  if (confirmDeleteWbBtn) {
    executeDeleteWorksheet(confirmDeleteWbBtn.dataset.confirmDeleteWorksheet);
    return;
  }

  const cancelDeleteWbBtn = event.target.closest("[data-cancel-delete-worksheet]");
  if (cancelDeleteWbBtn) {
    openWorksheetLibraryModal();
    return;
  }

  const openHistorical = event.target.closest("[data-open-historical]");
  if (openHistorical) {
    openHistoricalWorksheet(openHistorical.dataset.openHistorical);
    return;
  }

  const libraryMonthPrev = event.target.closest("[data-library-prev-month]");
  if (libraryMonthPrev) {
    libraryVisibleMonth = shiftMonthKey(libraryVisibleMonth, -1);
    refreshWorksheetLibraryModal();
    return;
  }

  const libraryMonthNext = event.target.closest("[data-library-next-month]");
  if (libraryMonthNext) {
    libraryVisibleMonth = shiftMonthKey(libraryVisibleMonth, 1);
    refreshWorksheetLibraryModal();
    return;
  }

  const opsAction = event.target.closest("[data-ops-action]");
  if (opsAction) {
    handleOpsAction(opsAction.dataset.opsAction);
    return;
  }

  const closeOps = event.target.closest("[data-close-ops]");
  if (closeOps) {
    closeOpsModal();
    return;
  }

  const searchRun = event.target.closest("[data-ticket-search-run]");
  if (searchRun) {
    renderTicketSearchResults();
    return;
  }

  const watchSave = event.target.closest("[data-watch-save]");
  if (watchSave) {
    saveWatchlistFromModal();
    return;
  }

  const watchDelete = event.target.closest("[data-watch-delete]");
  if (watchDelete) {
    deleteWatchlistItem(watchDelete.dataset.watchDelete);
    return;
  }

  const watchResolve = event.target.closest("[data-watch-resolve]");
  if (watchResolve) {
    setWatchlistItemStatus(watchResolve.dataset.watchResolve, "Resolved");
    return;
  }

  const watchReactivate = event.target.closest("[data-watch-reactivate]");
  if (watchReactivate) {
    setWatchlistItemStatus(watchReactivate.dataset.watchReactivate, "Active");
    return;
  }

  const watchEdit = event.target.closest("[data-watch-edit]");
  if (watchEdit) {
    editWatchlistNote(watchEdit.dataset.watchEdit);
    return;
  }

  const historyExport = event.target.closest("[data-history-export]");
  if (historyExport) {
    exportAssignmentHistoryCsv();
    return;
  }

  const historyClear = event.target.closest("[data-history-clear]");
  if (historyClear) {
    clearAssignmentHistory();
    return;
  }

  const assignSave = event.target.closest("[data-assign-save]");
  if (assignSave) {
    saveAgentAssignmentsFromModal();
    return;
  }

  const assignReset = event.target.closest("[data-assign-reset]");
  if (assignReset) {
    resetAgentAssignments();
    closeOpsModal();
    return;
  }

  const addAgentTrigger = event.target.closest("[data-add-agent-trigger]");
  if (addAgentTrigger) {
    openAddAgentModal();
    return;
  }

  const closeAddAgent = event.target.closest("[data-close-add-agent]");
  if (closeAddAgent) {
    closeAddAgentModal();
    return;
  }

  const addAgentSubmit = event.target.closest("[data-add-agent-submit]");
  if (addAgentSubmit && !addAgentSubmit.disabled) {
    submitAddAgentForm();
    return;
  }

  const renameAgentTrigger = event.target.closest("[data-rename-agent]");
  if (renameAgentTrigger) {
    openRenameAgentModal(renameAgentTrigger.dataset.renameAgent);
    return;
  }

  const closeRenameAgent = event.target.closest("[data-close-rename-agent]");
  if (closeRenameAgent) {
    closeRenameAgentModal();
    return;
  }

  const renameAgentSubmit = event.target.closest("[data-rename-agent-submit]");
  if (renameAgentSubmit && !renameAgentSubmit.disabled) {
    submitRenameAgentForm();
    return;
  }

  const markInactive = event.target.closest("[data-mark-inactive]");
  if (markInactive) {
    const agent = markInactive.dataset.markInactive;
    if (confirm(`Mark ${agent} as Inactive?\n\nThis will exclude the agent from future sampling while preserving historical data.`)) {
      setAgentStatus(agent, "Inactive");
      refreshAssignAgentsPanel();
    }
    return;
  }

  const reactivate = event.target.closest("[data-reactivate]");
  if (reactivate) {
    setAgentStatus(reactivate.dataset.reactivate, "Active");
    refreshAssignAgentsPanel();
    return;
  }

  const agentButton = event.target.closest("[data-agent-summary]");
  if (agentButton) {
    expandedAgent = expandedAgent === agentButton.dataset.agentSummary ? null : agentButton.dataset.agentSummary;
    render();
    return;
  }

  const metricButton = event.target.closest("[data-metric-key]");
  if (metricButton) {
    openMetricModal(metricButton.dataset.metricKey);
    return;
  }

  const closeModal = event.target.closest("[data-close-modal]");
  if (closeModal) {
    closeMetricModal();
    closeTagsModal();
    document.querySelector("[data-historical-modal]")?.remove();
    return;
  }

  const tagsButton = event.target.closest(".tags-btn");
  if (tagsButton) {
    openTicketTagsModal(tagsButton.dataset.tagsTicket, tagsButton.dataset.tagsChannel);
    return;
  }

  const rejectButton = event.target.closest(".reject-btn");
  if (rejectButton) {
    const ticketId = rejectButton.dataset.ticketId;
    const channel = rejectButton.dataset.channel || "";
    toggleRejectedTicket(ticketId);
    if (rejectedTickets.has(ticketId)) {
      removeSampledTicket(channel, ticketId);
      if (channel) copiedTickets.delete(getSampleKey(channel, ticketId));
      copiedTickets.delete(ticketId);
      persistCopiedTickets();
    }
    render();
    return;
  }

  const storageActionBtn = event.target.closest("[data-storage-action]");
  if (storageActionBtn) {
    const action = storageActionBtn.dataset.storageAction;
    if (action === "run-compaction") {
      checkAndTriggerProactiveCompaction(true);
      if (typeof statusEl !== "undefined" && statusEl) {
        statusEl.textContent = "Proactive storage compaction completed. Historical records compressed.";
      }
      refreshWorksheetLibraryModal();
    }
    return;
  }

  const perfPeriodBtn = event.target.closest("[data-perf-period]");
  if (perfPeriodBtn) {
    activePerformancePeriod = perfPeriodBtn.dataset.perfPeriod;
    refreshAnalyticsHubPanel();
    return;
  }

  const analyticsTabBtn = event.target.closest("[data-analytics-tab]");
  if (analyticsTabBtn) {
    const tab = analyticsTabBtn.dataset.analyticsTab;
    if (tab === "weekly" || tab === "monthly" || tab === "quarterly") {
      activeAnalyticsTab = "performance";
      activePerformancePeriod = tab === "weekly" ? "week" : tab === "monthly" ? "month" : "quarter";
    } else {
      activeAnalyticsTab = tab;
    }
    refreshAnalyticsHubPanel();
    return;
  }

  const periodActionBtn = event.target.closest("[data-period-action]");
  if (periodActionBtn) {
    const action = periodActionBtn.dataset.periodAction;
    if (action === "prev-week") {
      if (activeAnalyticsWeek > 1) activeAnalyticsWeek--;
      else { activeAnalyticsWeek = 52; activeAnalyticsYear--; }
    } else if (action === "next-week") {
      if (activeAnalyticsWeek < 52) activeAnalyticsWeek++;
      else { activeAnalyticsWeek = 1; activeAnalyticsYear++; }
    } else if (action === "prev-month") {
      activeAnalyticsMonth = shiftMonthKey(activeAnalyticsMonth, -1);
    } else if (action === "next-month") {
      activeAnalyticsMonth = shiftMonthKey(activeAnalyticsMonth, 1);
    } else if (action === "prev-quarter") {
      activeAnalyticsQuarter = getPriorQuarterKey(activeAnalyticsQuarter);
    } else if (action === "next-quarter") {
      const [y, q] = activeAnalyticsQuarter.split("-");
      const numY = Number(y);
      if (q === "Q1") activeAnalyticsQuarter = `${numY}-Q2`;
      else if (q === "Q2") activeAnalyticsQuarter = `${numY}-Q3`;
      else if (q === "Q3") activeAnalyticsQuarter = `${numY}-Q4`;
      else activeAnalyticsQuarter = `${numY + 1}-Q1`;
    }
    refreshAnalyticsHubPanel();
    return;
  }

  const toggleMissBtn = event.target.closest("[data-toggle-systemic-miss]");
  if (toggleMissBtn) {
    const missName = toggleMissBtn.dataset.toggleSystemicMiss;
    expandedSystemicMiss = expandedSystemicMiss === missName ? null : missName;
    refreshAnalyticsHubPanel();
    return;
  }

  const toggleAgentBtn = event.target.closest("[data-toggle-agent-tickets]");
  if (toggleAgentBtn) {
    const agentName = toggleAgentBtn.dataset.toggleAgentTickets;
    expandedAgentDrilldown = expandedAgentDrilldown === agentName ? null : agentName;
    refreshAnalyticsHubPanel();
    return;
  }

  const button = event.target.closest(".copy-btn");
  if (!button) return;
  await copyText(button.dataset.copy);
  const ticketId = button.dataset.ticketId;
  const channel = button.dataset.channel || "";
  const pick = findTicketById(ticketId, channel);
  const compKey = getSampleKey(pick?.channel || channel, ticketId);
  copiedTickets.add(compKey);
  copiedTickets.add(ticketId);
  persistCopiedTickets();
  if (pick) {
    recordSampledTicket(pick);
  }
  button.textContent = "Copied";
  setTimeout(() => {
    button.textContent = "Copy";
  }, 1200);
  render();
});

// Delegated so re-rendering the assign panel (mark inactive/reactivate,
// save, reset) never needs to re-attach these.
document.addEventListener("input", (event) => {
  if (event.target.id === "intelSearchInput") {
    intelSearchQuery = event.target.value;
    refreshAnalyticsHubPanel();
    return;
  }

  const historySearch = event.target.closest("[data-history-search]");
  if (historySearch) {
    assignHistorySearch = historySearch.value;
    refreshAssignHistoryTable();
    return;
  }

  const addAgentName = event.target.closest("[data-add-agent-name]");
  if (addAgentName) {
    validateAddAgentForm();
    return;
  }

  const renameAgentInput = event.target.closest("[data-rename-agent-input]");
  if (renameAgentInput) {
    validateRenameAgentForm();
    return;
  }
});

document.addEventListener("keydown", (event) => {
  const addAgentModal = document.querySelector("[data-add-agent-modal]");
  if (addAgentModal) {
    if (event.key === "Escape") {
      event.preventDefault();
      closeAddAgentModal();
      return;
    }
    if (event.key === "Enter" && event.target.closest("[data-add-agent-name]")) {
      event.preventDefault();
      const submitBtn = addAgentModal.querySelector("[data-add-agent-submit]");
      if (submitBtn && !submitBtn.disabled) submitAddAgentForm();
      return;
    }
  }

  const renameAgentModal = document.querySelector("[data-rename-agent-modal]");
  if (renameAgentModal) {
    if (event.key === "Escape") {
      event.preventDefault();
      closeRenameAgentModal();
      return;
    }
    if (event.key === "Enter" && event.target.closest("[data-rename-agent-input]")) {
      event.preventDefault();
      const submitBtn = renameAgentModal.querySelector("[data-rename-agent-submit]");
      if (submitBtn && !submitBtn.disabled) submitRenameAgentForm();
      return;
    }
  }
});

document.addEventListener("change", (event) => {
  if (event.target.id === "analyticsWeekSelect") {
    activeAnalyticsWeek = Number(event.target.value);
    refreshAnalyticsHubPanel();
    return;
  }
  if (event.target.id === "analyticsYearSelect") {
    activeAnalyticsYear = Number(event.target.value);
    refreshAnalyticsHubPanel();
    return;
  }
  if (event.target.id === "analyticsMonthSelect") {
    activeAnalyticsMonth = event.target.value;
    refreshAnalyticsHubPanel();
    return;
  }
  if (event.target.id === "analyticsQuarterSelect") {
    activeAnalyticsQuarter = event.target.value;
    refreshAnalyticsHubPanel();
    return;
  }
  if (event.target.id === "intelPeriodSelect") {
    intelPeriodFilter = event.target.value;
    refreshAnalyticsHubPanel();
    return;
  }
  if (event.target.id === "intelAuditorSelect") {
    intelAuditorFilter = event.target.value;
    refreshAnalyticsHubPanel();
    return;
  }
  if (event.target.id === "intelAgentSelect") {
    intelAgentFilter = event.target.value;
    refreshAnalyticsHubPanel();
    return;
  }
  if (event.target.id === "intelChannelSelect") {
    intelChannelFilter = event.target.value;
    refreshAnalyticsHubPanel();
    return;
  }
  if (event.target.id === "intelCleanSelect") {
    intelCleanFilter = event.target.value;
    refreshAnalyticsHubPanel();
    return;
  }

  const auditorFilter = event.target.closest("[data-history-auditor-filter]");
  if (auditorFilter) {
    assignHistoryAuditorFilter = auditorFilter.value;
    refreshAssignHistoryTable();
  }
});

async function analyzeWorkbook(buffer) {
  const zip = await JSZip.loadAsync(buffer);
  const workbookXml = await readText(zip, "xl/workbook.xml");
  const workbookRelsXml = await readText(zip, "xl/_rels/workbook.xml.rels");
  const sharedStrings = await readSharedStrings(zip);
  const dateStyles = await readDateStyles(zip);
  const sheets = readSheets(workbookXml, workbookRelsXml);
  const grouped = Object.fromEntries(TARGET_AGENTS.map((agent) => [agent, []]));
  const sheetSummaries = [];
  const metrics = {
    totalRows: 0,
    targetRows: 0,
    blankModule: 0,
    blankFeature: 0,
    blankOrganization: 0,
    unsatisfied: 0,
    emailUnresolvedNoHold: 0,
    headerIssues: 0,
    longChats: 0,
    callsOver12: 0,
    callsOver10: 0,
    suspiciousTalkTime: 0,
    voiceTransfers: 0,
  };

  // --- Ticket dedup pipeline ------------------------------------------------
  // Zendesk's N-1 export now repeats a ticket once per tag applied to it, so
  // the same (Channel, Ticket ID) can show up on many rows. Merge every row
  // for a given key into ONE ticket object - tags combined, every other
  // field keeping the first non-empty value seen - BEFORE any scoring runs.
  // Everything downstream (rankings, "Other Tickets", metrics, copy,
  // cross-out, monthly history) reads from `grouped[agent]`, so deduping
  // here is sufficient to fix all of them without touching that code.
  const mergedByKey = new Map();
  const mergeOrder = [];
  let unkeyedRowCounter = 0;

  for (const sheet of sheets) {
    const xml = await readText(zip, sheet.path);
    const rows = readWorksheet(xml, sharedStrings, dateStyles);
    if (!rows.length) continue;

    const headers = rows[0].map(clean);
    const channel = sheetChannel(sheet.name);

    sheetSummaries.push({
      sheet: sheet.name,
      channel,
      rows: Math.max(rows.length - 1, 0),
      targetAgentRows: 0,
    });

    for (const values of rows.slice(1)) {
      const row = Object.fromEntries(headers.map((header, index) => [header, values[index] ?? ""]));
      metrics.totalRows += 1;

      const ticketId = clean(pick(row, "Ticket ID"));
      unkeyedRowCounter += 1;
      // Rows with no Ticket ID can't be deduped against each other safely -
      // give each one its own unique key so they still flow through untouched.
      const dedupKey = `${channel}|${ticketId || `__no-id-${unkeyedRowCounter}`}`;

      if (!mergedByKey.has(dedupKey)) {
        mergedByKey.set(dedupKey, {
          row: { ...row },
          channel,
          sheet: sheet.name,
          ticketId,
          rowsMerged: 1,
        });
        mergeOrder.push(dedupKey);
      } else {
        const entry = mergedByKey.get(dedupKey);
        mergeDuplicateTicketRow(entry.row, row);
        entry.rowsMerged += 1;
      }
    }
  }

  if (DEBUG_DEDUP) {
    for (const key of mergeOrder) {
      const entry = mergedByKey.get(key);
      if (entry.rowsMerged <= 1) continue;
      const tagKey = findTagColumnKey(entry.row);
      const mergedTags = tagKey ? parseTagTokens(entry.row[tagKey]) : [];
      console.log(
        `[DEBUG_DEDUP] Merged Ticket ${entry.ticketId || "(no id)"} [${entry.channel}]\n` +
          `  Rows merged : ${entry.rowsMerged}\n` +
          `  Tags merged :\n${mergedTags.map((tag) => `    ${tag}`).join("\n") || "    (none)"}`,
      );
    }
  }

  const sheetMatchedCounts = Object.create(null);

  for (const key of mergeOrder) {
    const { row, channel, sheet, ticketId } = mergedByKey.get(key);
    const agentValue = clean(pick(row, "Ticket assignee", "Assignee name"));
    const canonicalAgent = findCanonicalAgent(agentValue);
    if (!canonicalAgent) continue;

    metrics.targetRows += 1;
    sheetMatchedCounts[sheet] = (sheetMatchedCounts[sheet] || 0) + 1;

    const scored = scoreTicket(row, channel);
    const ticketAssignee = clean(pick(row, "Ticket assignee"));
    const callAgent = clean(pick(row, "Call agent name"));
    if (channel === "Voice" && ticketAssignee && callAgent && normalizeName(ticketAssignee) !== normalizeName(callAgent)) {
      scored.tags.push("Voice Transfer");
      scored.checks.push(statusTag("Call agent differs", true));
    }
    scored.score -= getLearningPenalty(scored);
    updateMetrics(metrics, row, channel);
    grouped[canonicalAgent].push({
      ...scored,
      channel,
      sheet,
      date: formatDate(pick(row, "Ticket created - Date")),
      ticketId,
      agent: canonicalAgent,
      auditor: AGENT_TO_AUDITOR[canonicalAgent],
      assignee: agentValue,
      organization: clean(pick(row, "Ticket organization", "Ticket organization name")),
      subject: getSubjectValue(row),
      module: clean(pick(row, "Module")),
      feature: clean(pick(row, "Feature")),
      chatDuration: clean(pick(row, "Chat duration brackets", "Messaging duration brackets", "Duration brackets")),
      callDuration: clean(pick(row, "Call duration (min)")),
      callTalkTime: clean(pick(row, "Call talk time (min)")),
      callDirection: clean(pick(row, "Call direction")),
      satisfaction: clean(pick(row, "Ticket satisfaction rating", "Chat satisfaction rating", "Messaging satisfaction rating")),
      solvedHour: clean(pick(row, "Ticket solved - Hour")),
      resolutionTimeHours: clean(pick(row, "resolution_time_hours")),
      keepOnHold: clean(pick(row, "Keep on hold")),
    });
  }

  for (const summary of sheetSummaries) {
    summary.targetAgentRows = sheetMatchedCounts[summary.sheet] || 0;
  }

  const agents = Object.entries(grouped).map(([agent, tickets]) => {
    tickets.sort((a, b) => ticketFallbackTier(a) - ticketFallbackTier(b) || b.score - a.score || Number(a.channel === "Email") - Number(b.channel === "Email") || String(a.ticketId).localeCompare(String(b.ticketId)));
    const allTickets = tickets.map((ticket, index) => ({
      ...ticket,
      rank: index + 1,
      recommendation: classifyRank(index, ticket.score),
    }));
    return {
      agent,
      auditor: AGENT_TO_AUDITOR[agent],
      available: tickets.length,
      status: tickets.length >= 3 ? "Ready" : "Shortage",
      picks: allTickets.slice(0, 3),
      tickets: allTickets,
    };
  });

  return { agents, sheets: sheetSummaries, metrics };
}

function ticketFallbackTier(ticket) {
  // Merged/child tickets have nothing to audit - always last priority,
  // regardless of score.
  if (ticket.isMergedChild) return 2;
  if (ticket.channel !== "Voice") return 0;
  const duration = parseFloatValue(ticket.callDuration);
  return duration == null || duration < 10 ? 1 : 0;
}

async function readText(zip, path) {
  const file = zip.file(path);
  if (!file) throw new Error(`Missing ${path}`);
  return file.async("text");
}

async function readSharedStrings(zip) {
  const file = zip.file("xl/sharedStrings.xml");
  if (!file) return [];
  const xml = await file.async("text");
  const doc = parseXml(xml);
  return [...doc.getElementsByTagName("si")].map((item) =>
    [...item.getElementsByTagName("t")].map((node) => node.textContent || "").join(""),
  );
}

async function readDateStyles(zip) {
  const file = zip.file("xl/styles.xml");
  if (!file) return new Set();
  const doc = parseXml(await file.async("text"));
  const customDateFmtIds = new Set(
    [...doc.getElementsByTagName("numFmt")]
      .filter((node) => /[dyYm]/.test(node.getAttribute("formatCode") || ""))
      .map((node) => node.getAttribute("numFmtId")),
  );
  const builtInDateFmtIds = new Set(["14", "15", "16", "17", "22", "27", "30", "36", "50", "57"]);
  return new Set(
    [...doc.getElementsByTagName("xf")]
      .map((node, index) => ({ index, id: node.getAttribute("numFmtId") }))
      .filter((style) => builtInDateFmtIds.has(style.id) || customDateFmtIds.has(style.id))
      .map((style) => String(style.index)),
  );
}

function readSheets(workbookXml, relsXml) {
  const workbook = parseXml(workbookXml);
  const rels = parseXml(relsXml);
  const relMap = Object.fromEntries(
    [...rels.getElementsByTagName("Relationship")].map((rel) => [
      rel.getAttribute("Id"),
      `xl/${rel.getAttribute("Target").replace(/^\/?xl\//, "")}`,
    ]),
  );
  return [...workbook.getElementsByTagName("sheet")].map((sheet) => ({
    name: sheet.getAttribute("name"),
    path: relMap[sheet.getAttribute("r:id")],
  }));
}

function readWorksheet(xml, sharedStrings, dateStyles) {
  const doc = parseXml(xml);
  const rowNodes = [...doc.getElementsByTagName("row")];
  return rowNodes.map((row) => {
    const values = [];
    for (const cell of [...row.getElementsByTagName("c")]) {
      const ref = cell.getAttribute("r") || "";
      const colIndex = columnIndex(ref.replace(/\d+/g, ""));
      values[colIndex] = readCell(cell, sharedStrings, dateStyles);
    }
    return values;
  });
}

function readCell(cell, sharedStrings, dateStyles) {
  const type = cell.getAttribute("t");
  const style = cell.getAttribute("s");
  const valueNode = cell.getElementsByTagName("v")[0];
  if (type === "inlineStr") {
    return [...cell.getElementsByTagName("t")].map((node) => node.textContent || "").join("");
  }
  if (!valueNode) return "";
  const raw = valueNode.textContent || "";
  if (type === "s") return sharedStrings[Number(raw)] ?? "";
  if (dateStyles.has(style)) return excelDateToString(Number(raw));
  return raw;
}

function parseXml(xml) {
  return new DOMParser().parseFromString(xml, "application/xml");
}

function columnIndex(letters) {
  return [...letters].reduce((sum, char) => sum * 26 + char.charCodeAt(0) - 64, 0) - 1;
}

function excelDateToString(serial) {
  if (!Number.isFinite(serial)) return "";
  const date = new Date(Date.UTC(1899, 11, 30 + Math.floor(serial)));
  return formatDate(date);
}

function clean(value) {
  if (value == null) return "";
  return String(value).replace(/\u00a0/g, " ").trim();
}

function normalizeName(value) {
  return clean(value)
    .replace(/[^a-z0-9 ]/gi, " ")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

function compactName(value) {
  return normalizeName(value).replace(/\s+/g, "");
}

function findCanonicalAgent(value) {
  const normalized = normalizeName(value);
  if (!normalized) return null;
  if (AGENT_LOOKUP[normalized]) return AGENT_LOOKUP[normalized];
  if (AGENT_ALIASES[normalized]) return AGENT_ALIASES[normalized];

  const compact = compactName(value);
  let best = { agent: null, distance: Infinity };
  for (const agent of TARGET_AGENTS) {
    const candidate = compactName(agent);
    if (compact.includes(candidate) || candidate.includes(compact)) {
      return agent;
    }
    const distance = levenshtein(compact, candidate);
    if (distance < best.distance) {
      best = { agent, distance };
    }
  }
  return best.distance <= Math.max(2, Math.floor(compact.length * 0.18)) ? best.agent : null;
}

function levenshtein(a, b) {
  const dp = Array.from({ length: a.length + 1 }, (_, i) => [i]);
  for (let j = 1; j <= b.length; j += 1) dp[0][j] = j;
  for (let i = 1; i <= a.length; i += 1) {
    for (let j = 1; j <= b.length; j += 1) {
      dp[i][j] =
        a[i - 1] === b[j - 1]
          ? dp[i - 1][j - 1]
          : Math.min(dp[i - 1][j], dp[i][j - 1], dp[i - 1][j - 1]) + 1;
    }
  }
  return dp[a.length][b.length];
}

function formatDate(value) {
  if (value instanceof Date) {
    return `${String(value.getUTCMonth() + 1).padStart(2, "0")}/${String(value.getUTCDate()).padStart(2, "0")}/${value.getUTCFullYear()}`;
  }
  const text = clean(value);
  const iso = text.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) return `${iso[2]}/${iso[3]}/${iso[1]}`;
  const us = text.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/);
  if (us) return `${us[1].padStart(2, "0")}/${us[2].padStart(2, "0")}/${us[3].length === 2 ? `20${us[3]}` : us[3]}`;
  return text;
}

function isBlank(value) {
  const text = clean(value);
  return text === "" || ["n/a", "na", "none", "null", "-"].includes(text.toLowerCase());
}

function sheetChannel(sheetName) {
  const lowered = sheetName.toLowerCase();
  if (lowered.includes("voice") || lowered.includes("call")) return "Voice";
  if (lowered.includes("email")) return "Email";
  if (lowered.includes("chat") || lowered.includes("messag")) return "Chat";
  return sheetName;
}

function pick(row, ...names) {
  const lowered = Object.fromEntries(Object.entries(row).map(([key, value]) => [key.toLowerCase(), value]));
  for (const name of names) {
    if (name.toLowerCase() in lowered) return lowered[name.toLowerCase()];
  }
  return "";
}

function parseFloatValue(value) {
  const match = clean(value).match(/-?\d+(?:\.\d+)?/);
  return match ? Number(match[0]) : null;
}

function isUnsatisfied(value) {
  const text = clean(value).toLowerCase();
  if (!text) return false;
  if (["unsat", "bad", "poor", "negative", "dissatisfied"].some((word) => text.includes(word))) return true;
  const number = parseFloatValue(text);
  return number != null && number <= 2;
}

function statusTag(label, active) {
  return { label, active };
}

function getHoldReasonTags(value) {
  const text = clean(value).toLowerCase();
  const tags = [];
  if (!text || ["n/a", "na", "none", "null", "-"].includes(text)) return tags;
  if (text.includes("client requested") || text.includes("customer requested")) {
    tags.push("Client Requested");
  }
  if (text.includes("client follow") || text.includes("customer follow")) {
    tags.push("Client Follow Up");
  }
  if (text.includes("internal follow")) {
    tags.push("Internal Follow Up");
  }
  if (text.includes("sme") || text.includes("subject matter expert") || text.includes("need assistance")) {
    tags.push("SME Assistance");
  }
  return tags;
}

function hasHeaderIssue(subjectValue) {
  const subject = clean(subjectValue);
  if (!subject) return true;
  if (subject.toLowerCase().startsWith("conversation with")) return true;
  const knownModules = [
    "RCM",
    "Patient Engagement",
    "Front Office",
    "Reporting",
    "Others",
    "Other",
    "Practice Settings",
    "Scheduler",
    "Clinical",
    "Patient Services",
    "Insurance",
    "Billing",
    "Claims",
  ];
  const normalized = subject.replace(/[–—:|]/g, "-").replace(/\s+/g, " ").trim();
  const matchedModule = knownModules.find((module) => normalized.toLowerCase().startsWith(module.toLowerCase()));
  if (!matchedModule) return true;
  const remainder = normalized.slice(matchedModule.length).trim();
  return !/^[-/]\s*\S.{4,}/.test(remainder);
}

function hasHeaderIssueV2(subjectValue) {
  const subject = clean(subjectValue);
  if (!subject) return true;
  if (subject.toLowerCase().startsWith("conversation with")) return true;
  const knownModules = [
    "RCM",
    "Patient Engagement",
    "Front Office",
    "Reporting",
    "Others",
    "Other",
    "Practice Settings",
    "Scheduler",
    "Clinical",
    "Patient Services",
    "Insurance",
    "Billing",
    "Claims",
  ];
  const normalized = subject.replace(/[–—:|]/g, "-").replace(/\s+/g, " ").trim();
  const matchedModule = knownModules.find((module) => normalized.toLowerCase().startsWith(module.toLowerCase()));
  if (!matchedModule) return true;
  const remainder = normalized.slice(matchedModule.length).trim();
  return !/^[-/]\s*\S.{4,}/.test(remainder);
}

function hasCleanHeaderIssue(subjectValue) {
  return getSubjectIssueDetails(subjectValue, "All").hasHeaderIssue;
}

function getSubjectValue(row) {
  return clean(pick(row, "Ticket subject", "Subject"));
}

function getSubjectIssueDetails(subjectValue, channel) {
  const subject = clean(subjectValue);
  const lower = subject.toLowerCase();
  const normalizedChannel = clean(channel).toLowerCase();
  if (!subject) {
    return {
      hasHeaderIssue: true,
      isDefaultSubject: false,
      isGeneratedSubject: false,
      tag: "Missing Subject",
      reason: "Subject/header is blank",
    };
  }

  const isChatDefault = lower.startsWith("conversation with") || lower.startsWith("chat with");
  const isVoiceGenerated =
    /^(call with|missed call from|abandoned call from)(\b|:)/i.test(subject) ||
    /^call with caller\b/i.test(subject);
  const isEmailGenerated =
    /^google form has a new response/i.test(subject) ||
    /^\d{8}[_-]\d{6}/.test(subject) ||
    /^new response submitted/i.test(subject);
  const isDefaultSubject =
    isChatDefault ||
    (normalizedChannel === "chat" && isChatDefault) ||
    (normalizedChannel === "voice" && isVoiceGenerated) ||
    (normalizedChannel === "email" && isEmailGenerated);

  const knownModules = [
    "RCM",
    "RCMaaS",
    "Patient Engagement",
    "Front Office",
    "Reporting",
    "Analytics",
    "Others",
    "Other",
    "Practice Settings",
    "Scheduler",
    "Clinical",
    "Patient Services",
    "Patient Service",
    "Insurance",
    "Payments",
    "Billing",
    "Claims",
    "AEKA",
    "Tigerview",
  ];
  const normalized = subject.replace(/[\u2013\u2014:|]/g, "-").replace(/\s+/g, " ").trim();
  const normalizedLower = normalized.toLowerCase();
  // Accept "Module - Description", "Module // Description", "Module: Description"
  // (colon/dash/pipe all normalize to "-" above, so "//" and "-" both pass the
  // separator check), and also "Description - Module" with the module last -
  // some agents write it either way and both are fine as long as the format
  // is consistent.
  const matchedModuleFirst = knownModules.find((module) => normalizedLower.startsWith(module.toLowerCase()));
  const matchedModuleLast = !matchedModuleFirst && knownModules.find((module) => normalizedLower.endsWith(module.toLowerCase()));
  let hasHeaderIssue = true;
  if (matchedModuleFirst) {
    hasHeaderIssue = !/^[-/]\s*\S.{4,}/.test(normalized.slice(matchedModuleFirst.length).trim());
  } else if (matchedModuleLast) {
    const prefix = normalized.slice(0, normalized.length - matchedModuleLast.length).trim();
    hasHeaderIssue = !/\S.{4,}[-/]\s*$/.test(prefix);
  }
  let tag = "Header Issue";
  let reason = "Subject does not follow the module - issue format";
  if (isChatDefault) {
    tag = "Chat Default Subject";
    reason = "Chat subject still uses the default Conversation with title";
  } else if (isVoiceGenerated) {
    tag = "Voice Generated Subject";
    reason = "Voice subject still uses a generated call/missed/abandoned-call title";
  } else if (isEmailGenerated) {
    tag = "Email Generated Subject";
    reason = "Email subject still uses a generated form/timestamp title";
  }
  return {
    hasHeaderIssue,
    isDefaultSubject,
    isGeneratedSubject: isVoiceGenerated || isEmailGenerated,
    tag,
    reason,
  };
}

function scoreTicket(row, channel) {
  let score = 0;
  const reasons = [];
  const lacks = [];
  const tags = [];
  const checks = [];

  // Tag-driven rules (Feature: tag-based sampling parameters).
  // Only two tags are wired in for now, on purpose - more will follow later:
  //   1. MERGE_TICKET_TAG - this row is a child ticket closed by merge into
  //      a parent. There is nothing to audit, so it gets flagged and pushed
  //      to the bottom of the agent's list instead of scored normally.
  //   2. JIRA_TAG_KEYWORDS - Incident/System Error, Feature Request, and
  //      Clarification tickets are required to have an escalated JIRA tag.
  //      Missing it is a fatal miss (no JIRA ticket for the tech team), so
  //      it outweighs everything else in scoring.
  const rawTagKey = findTagColumnKey(row);
  const rawTags = rawTagKey ? parseTagTokens(row[rawTagKey]) : [];
  const isMergedChild = rawTags.some((tag) => fuzzyTagMatches(tag, MERGE_TICKET_TAG));
  checks.push(statusTag("Merged/child ticket", isMergedChild));
  if (isMergedChild) {
    tags.push("Merged Ticket");
    reasons.push("Closed by merge into a parent ticket - not auditable");
  }

  const requestType = clean(pick(row, "Support Request Type")).toLowerCase();
  const jiraRequired = !isMergedChild && JIRA_REQUIRED_TYPES.has(requestType);
  const jiraPresent = rawTags.some((tag) => fuzzyTagMatches(tag, JIRA_TICKET_TAG));
  checks.push(statusTag("Jira required", jiraRequired));
  if (jiraRequired && !jiraPresent) {
    score += 40;
    reasons.push("Incident/Feature Request/Clarification is missing a JIRA escalation tag");
    tags.push("Missing Jira");
  }

  if (channel === "Chat") {
    const duration = clean(pick(row, "Chat duration brackets", "Messaging duration brackets", "Duration brackets"));
    const hasLongChat = duration.includes(">12") || duration.includes("12+");
    checks.push(statusTag("Chat >12 min", hasLongChat));
    if (hasLongChat) {
      score += 35;
      reasons.push("Chat duration is >12 min");
      tags.push("Long Chat");
    } else {
      lacks.push("chat is not >12 min");
    }
  } else if (channel === "Voice") {
    const duration = parseFloatValue(pick(row, "Call duration (min)"));
    const talkTime = parseFloatValue(pick(row, "Call talk time (min)"));
    const direction = clean(pick(row, "Call direction")).toLowerCase();
    const isInbound = direction.includes("inbound");
    const hasIdealCall = duration != null && duration > 12;
    const hasOkCall = duration != null && duration >= 10;
    checks.push(statusTag("Inbound call", isInbound));
    checks.push(statusTag("Call >12 min", hasIdealCall));
    checks.push(statusTag("Call >=10 min", hasOkCall));
    if (isInbound) {
      score += 16;
      reasons.push("Inbound call has higher sampling value");
      tags.push("Inbound Call");
    }
    if (hasIdealCall) {
      score += 35;
      reasons.push("Call duration is more than 12 min");
      tags.push("Long Call");
    } else if (hasOkCall) {
      score += 18;
      reasons.push("Call duration is at least 10 min");
      lacks.push("call is not >12 min");
      tags.push("Usable Call");
    } else {
      lacks.push("call is below 10 min; use only if there are no stronger calls");
    }
    const suspiciousTalkGap =
      duration != null &&
      talkTime != null &&
      duration >= 5 &&
      (duration - talkTime >= 5 || talkTime / Math.max(duration, 0.01) < 0.6);
    checks.push(statusTag("Talk time mismatch", suspiciousTalkGap));
    if (suspiciousTalkGap) {
      score += 20;
      reasons.push("Call duration and talk time differ significantly");
      tags.push("Suspicious Talk Time");
    }
  }

  const moduleBlank = isBlank(pick(row, "Module"));
  const featureBlank = isBlank(pick(row, "Feature"));
  checks.push(statusTag("Module blank", moduleBlank));
  checks.push(statusTag("Feature blank", featureBlank));
  if (moduleBlank) {
    score += 18;
    reasons.push("Module/category is blank");
    tags.push("Blank Module");
  } else lacks.push("module is already filled");
  if (featureBlank) {
    score += 18;
    reasons.push("Feature/category is blank");
    tags.push("Blank Feature");
  } else lacks.push("feature is already filled");

  const orgBlank = isBlank(pick(row, "Ticket organization", "Ticket organization name"));
  checks.push(statusTag("Organization blank", orgBlank));
  if (orgBlank) {
    score += 20;
    reasons.push("Organization is blank");
    tags.push("Missing Org");
  } else lacks.push("organization is present");

  const unsatisfied = isUnsatisfied(pick(row, "Ticket satisfaction rating", "Chat satisfaction rating", "Messaging satisfaction rating"));
  checks.push(statusTag("Unsatisfied", unsatisfied));
  if (unsatisfied) {
    score += 28;
    reasons.push("Unsatisfied/low satisfaction signal");
    tags.push("Low CSAT");
  } else lacks.push("no unsatisfied rating signal");

  const subject = getSubjectValue(row);
  const subjectIssue = getSubjectIssueDetails(subject, channel);
  checks.push(statusTag("Default subject", subjectIssue.isDefaultSubject));
  checks.push(statusTag("Generated subject", subjectIssue.isGeneratedSubject));
  checks.push(statusTag("Header issue", subjectIssue.hasHeaderIssue));
  if (subjectIssue.isDefaultSubject || subjectIssue.isGeneratedSubject || subjectIssue.hasHeaderIssue) {
    score += 30;
    reasons.push(subjectIssue.reason);
    tags.push(subjectIssue.tag);
    if (subjectIssue.hasHeaderIssue && subjectIssue.tag !== "Header Issue") tags.push("Header Issue");
  } else {
    lacks.push("subject/header format looks clean");
  }

  const solvedBlank = isBlank(pick(row, "Ticket solved - Hour"));
  const holdBlank = isBlank(pick(row, "Keep on hold"));
  const holdTags = getHoldReasonTags(pick(row, "Keep on hold"));
  for (const tag of holdTags) {
    checks.push(statusTag(tag, true));
    tags.push(tag);
  }
  if (channel === "Email") {
    const resolutionBlank = isBlank(pick(row, "resolution_time_hours"));
    const emailUnresolvedNoHold = resolutionBlank && holdBlank;
    checks.push(statusTag("Email unresolved/no hold", emailUnresolvedNoHold));
    if (emailUnresolvedNoHold) {
      score += 24;
      reasons.push("Email has blank resolution time and no hold reason");
      tags.push("Email No Hold");
    }
  }

  if (channel === "Chat" || channel === "Voice") {
    score += 8;
    reasons.push(`${channel} has channel priority`);
    tags.push("Channel Priority");
  }

  if (!reasons.length) reasons.push("Available ticket for target agent");
  return { score, reasons, lacks: lacks.slice(0, 4), tags, checks, rawTags, isMergedChild };
}

function updateMetrics(metrics, row, channel) {
  if (isBlank(pick(row, "Module"))) metrics.blankModule += 1;
  if (isBlank(pick(row, "Feature"))) metrics.blankFeature += 1;
  if (isBlank(pick(row, "Ticket organization", "Ticket organization name"))) metrics.blankOrganization += 1;
  if (isUnsatisfied(pick(row, "Ticket satisfaction rating", "Chat satisfaction rating", "Messaging satisfaction rating"))) metrics.unsatisfied += 1;
  if (getSubjectIssueDetails(getSubjectValue(row), channel).hasHeaderIssue) metrics.headerIssues += 1;
  if (channel === "Email" && isBlank(pick(row, "resolution_time_hours")) && isBlank(pick(row, "Keep on hold"))) metrics.emailUnresolvedNoHold += 1;
  if (channel === "Chat" && (clean(pick(row, "Chat duration brackets", "Messaging duration brackets", "Duration brackets")).includes(">12") || clean(pick(row, "Chat duration brackets", "Messaging duration brackets", "Duration brackets")).includes("12+"))) {
    metrics.longChats += 1;
  }
  if (channel === "Voice") {
    const duration = parseFloatValue(pick(row, "Call duration (min)"));
    const talkTime = parseFloatValue(pick(row, "Call talk time (min)"));
    if (duration != null && duration > 12) metrics.callsOver12 += 1;
    if (duration != null && duration >= 10) metrics.callsOver10 += 1;
    if (duration != null && talkTime != null && duration >= 5 && (duration - talkTime >= 5 || talkTime / Math.max(duration, 0.01) < 0.6)) {
      metrics.suspiciousTalkTime += 1;
    }
    const assignee = clean(pick(row, "Ticket assignee"));
    const callAgent = clean(pick(row, "Call agent name"));
    if (assignee && callAgent && assignee.toLowerCase() !== callAgent.toLowerCase()) metrics.voiceTransfers += 1;
  }
}

function classifyRank(index, score) {
  if (index === 0) return "Ideal pick";
  if (score >= 60) return "Strong backup";
  return "Backup option";
}

function getLearningKeys(ticketLike) {
  const tags = ticketLike?.tags || [];
  const checks = ticketLike?.checks || [];
  const activeChecks = checks.filter((check) => check.active).map((check) => check.label);
  return [...new Set([...tags, ...activeChecks])].filter(Boolean);
}

function getLearningPenalty(ticketLike) {
  return getLearningKeys(ticketLike).reduce((sum, key) => {
    return sum + Math.min(18, (rejectedPatternCounts[key] || 0) * 4);
  }, 0);
}

function toggleRejectedTicket(ticketId) {
  triggerHapticPulse();
  const id = clean(ticketId);
  if (!id) return;
  const ticket = findTicketById(id);
  if (rejectedTickets.has(id)) {
    rejectedTickets.delete(id);
    for (const key of getLearningKeys(ticket)) {
      rejectedPatternCounts[key] = Math.max(0, (rejectedPatternCounts[key] || 0) - 1);
    }
  } else {
    rejectedTickets.add(id);
    for (const key of getLearningKeys(ticket)) {
      rejectedPatternCounts[key] = (rejectedPatternCounts[key] || 0) + 1;
    }
  }
  persistRejectedLearning();
}

function findTicketById(ticketId) {
  const id = clean(ticketId);
  for (const agent of currentPayload?.agents || []) {
    const found = agent.tickets.find((ticket) => clean(ticket.ticketId) === id);
    if (found) return found;
  }
  return null;
}

function persistRejectedLearning() {
  safeStorageSetItem("rejectedTicketsV1", JSON.stringify([...rejectedTickets]));
  safeStorageSetItem("rejectedPatternCountsV1", JSON.stringify(rejectedPatternCounts));
}

function loadWatchlist() {
  try {
    const items = JSON.parse(localStorage.getItem("ticketWatchlistV1") || "[]");
    return Array.isArray(items) ? items : [];
  } catch {
    return [];
  }
}

function saveWatchlist() {
  safeStorageSetItem("ticketWatchlistV1", JSON.stringify(watchlistItems));
}

function handleOpsAction(action) {
  setOpsMenuOpen(false);
  if (action === "analytics") {
    openAnalyticsHubModal();
    return;
  }
  if (action === "intelligence") {
    openHistoricalIntelligenceModal();
    return;
  }
  if (action === "audit") {
    AUDIT_SHEETS.forEach((url) => window.open(url, "_blank", "noopener,noreferrer"));
    return;
  }
  if (action === "firstline") {
    window.open(FIRSTLINE_URL, "_blank", "noopener,noreferrer");
    return;
  }
  if (action === "search") {
    openTicketSearchModal();
    return;
  }
  if (action === "watchlist") {
    openWatchlistModal();
    return;
  }
  if (action === "sop") {
    openSopModal();
    return;
  }
  if (action === "assign") {
    openAssignAgentsModal();
  }
}

function openOpsModal(title, subtitle, bodyHtml, customClass = "") {
  closeOpsModal();
  closeMetricModal();
  const modal = document.createElement("div");
  modal.className = "modal-backdrop";
  modal.dataset.opsModal = "true";
  modal.innerHTML = `
    <section class="metric-modal ops-modal ${escapeHtml(customClass)}" role="dialog" aria-modal="true" aria-label="${escapeHtml(title)}">
      <header>
        <div>
          <strong>${escapeHtml(title)}</strong>
          <span>${escapeHtml(subtitle)}</span>
        </div>
        <button type="button" data-close-ops>&times;</button>
      </header>
      <div class="ops-panel-body">${bodyHtml}</div>
    </section>
  `;
  document.body.appendChild(modal);
}

function closeOpsModal() {
  document.querySelector("[data-ops-modal]")?.remove();
}


// ==========================================================================
// AI SEARCH AGENT & INTELLIGENT SEARCH ENGINE
// ==========================================================================

function executeAiSearchQuery(query) {
  const rawQ = clean(query);
  if (!rawQ) return null;
  const q = rawQ.toLowerCase();
  const directId = extractTicketId(rawQ);
  const allKnownAgents = new Set([
    ...Object.keys(agentAssignments || {}),
    ...TARGET_AGENTS,
    ...(currentPayload?.agents || []).map((a) => a.name || a.agent),
    ...Object.values(samplerIntelligence).map((t) => t.agent),
  ].filter(Boolean));
  const knownAgents = [...allKnownAgents];
  const matchedAgents = knownAgents.filter((a) => {
    const lowA = a.toLowerCase();
    if (q.includes(lowA) || q.includes(normalizeName(a))) return true;
    const parts = lowA.split(/\s+/).filter((p) => p.length >= 3);
    return parts.some((p) => q.includes(p));
  });
  const matchedChannels = ["chat", "voice", "email"].filter((c) => q.includes(c) || (c === "voice" && q.includes("call")) || (c === "chat" && q.includes("messag")));
  
  const knownMisses = [
    "Header Issue", "Blank Module", "Blank Feature", "Email No Hold", "Missing Jira",
    "Missing Subject", "Blank Organization", "Bad CSAT", "No Organisation", "Merged Tickets"
  ];
  const matchedMisses = knownMisses.filter((m) => q.includes(m.toLowerCase()) || q.includes(m.replace(/\s+/g, "").toLowerCase()));

  const wantsClean = q.includes("clean") || q.includes("pass") || q.includes("100%");
  const wantsMiss = q.includes("miss") || q.includes("fail") || q.includes("issue") || q.includes("defect") || q.includes("error");
  const wantsHighImpact = q.includes("high impact") || q.includes("high-impact") || q.includes("major");
  const wantsMerged = q.includes("merge");

  const allCandidateTickets = [];
  const seenIds = new Set();

  const addCandidate = (ticket, source) => {
    const tid = String(ticket.ticketId || ticket.id || "");
    const compKey = `${ticket.channel || "Chat"}::${tid}`;
    if (!tid || seenIds.has(compKey)) return;
    seenIds.add(compKey);
    allCandidateTickets.push({ ...ticket, _source: source, _compKey: compKey });
  };

  (currentPayload?.agents || []).flatMap((a) => a.tickets).forEach((t) => addCandidate(t, "Live Workbook"));
  Object.values(samplerIntelligence).forEach((t) => addCandidate(t, "Historical Sample"));

  const scoredResults = allCandidateTickets.map((ticket) => {
    let score = 0;
    const reasons = [];
    const tid = String(ticket.ticketId || ticket.id || "");
    const agent = ticket.agent || "";
    const channel = ticket.channel || "";
    const subject = ticket.subject || "";
    const module = ticket.module || "";
    const feature = ticket.feature || "";
    const misses = getTicketMisses(ticket);
    const tags = ticket.tags || [];

    if (directId && tid.includes(directId)) {
      score += (tid === directId ? 120 : 60);
      reasons.push(`Ticket #${tid}`);
    }

    if (matchedAgents.length) {
      if (matchedAgents.some((a) => agent.toLowerCase().includes(a.toLowerCase()))) {
        score += 45;
        reasons.push(`Agent: ${agent}`);
      }
    } else if (q.length > 2 && agent.toLowerCase().includes(q)) {
      score += 35;
      reasons.push(`Agent match: ${agent}`);
    }

    if (matchedChannels.length) {
      if (matchedChannels.some((c) => channel.toLowerCase().includes(c) || (c === "voice" && channel.toLowerCase().includes("call")))) {
        score += 20;
        reasons.push(`Channel: ${channel}`);
      }
    }

    if (matchedMisses.length) {
      const hitMiss = matchedMisses.find((m) => misses.some((miss) => miss.toLowerCase().includes(m.toLowerCase())) || tags.some((t) => t.toLowerCase().includes(m.toLowerCase())));
      if (hitMiss) {
        score += 45;
        reasons.push(`Miss: ${hitMiss}`);
      }
    }

    if (wantsClean && misses.length === 0 && !ticket.isMergedChild) {
      score += 30;
      reasons.push("Clean Candidate");
    }
    if (wantsMiss && misses.length > 0) {
      score += 25;
      reasons.push(`${misses.length} Misses`);
    }
    if (wantsHighImpact && (misses.length > 2 || misses.some((m) => ["Header Issue", "Blank Module", "Blank Feature", "Email No Hold", "Missing Jira"].includes(m)))) {
      score += 35;
      reasons.push("High-Impact");
    }
    if (wantsMerged && ticket.isMergedChild) {
      score += 30;
      reasons.push("Merged Ticket");
    }

    const fullText = `${subject} ${module} ${feature} ${tags.join(" ")}`.toLowerCase();
    const queryWords = q.split(/\s+/).filter((w) => w.length > 2);
    let wordHits = 0;
    queryWords.forEach((w) => {
      if (fullText.includes(w)) {
        wordHits++;
        score += 15;
      }
    });
    if (wordHits > 0) {
      reasons.push(`Keyword match (${wordHits} terms)`);
    }

    return { ticket, score, reasons, misses };
  });

  const matchingTickets = scoredResults
    .filter((r) => r.score > 0)
    .sort((a, b) => b.score - a.score)
    .map((r) => ({ ...r.ticket, _reasons: r.reasons, _score: r.score, _misses: r.misses }));

  const total = matchingTickets.length;
  const cleanCount = matchingTickets.filter((t) => t._misses.length === 0 && !t.isMergedChild).length;
  const missCount = total - cleanCount;
  const complianceRate = total ? Math.round((cleanCount / total) * 100) : 0;
  const highImpactCount = matchingTickets.filter((t) => t._misses.length > 2 || t._misses.some((m) => ["Header Issue", "Blank Module", "Blank Feature", "Email No Hold", "Missing Jira"].includes(m))).length;

  let aiBrief = "";
  if (total === 0) {
    aiBrief = `No matching tickets found for query "${rawQ}". Try searching by numerical Ticket ID, Agent Name (e.g. Alice), Support Channel (e.g. Voice), or Miss Category (e.g. Header Issue).`;
  } else if (matchedAgents.length && matchedMisses.length) {
    aiBrief = `AI Analysis: Located ${total} ticket${total === 1 ? "" : "s"} for ${matchedAgents.join(", ")} associated with ${matchedMisses.join(", ")}. Compliance: ${complianceRate}%. ${highImpactCount} ticket${highImpactCount === 1 ? "" : "s"} qualify as High-Impact requiring coaching review.`;
  } else if (matchedAgents.length) {
    aiBrief = `AI Analysis: Located ${total} ticket${total === 1 ? "" : "s"} for ${matchedAgents.join(", ")} with ${complianceRate}% compliance rate (${cleanCount} clean, ${missCount} with requirement misses).`;
  } else if (matchedMisses.length) {
    aiBrief = `AI Analysis: Detected ${total} ticket${total === 1 ? "" : "s"} exhibiting ${matchedMisses.join(", ")}. Coaching Directive: Verify standard subject formatting and mandatory SOP module classification.`;
  } else if (directId) {
    aiBrief = `AI Analysis: Located ticket #${directId} with complete verified requirement checks and 1-click Zendesk connection.`;
  } else {
    aiBrief = `AI Analysis: Found ${total} ticket${total === 1 ? "" : "s"} matching "${rawQ}". Team compliance rate across these results is ${complianceRate}% (${cleanCount} clean, ${missCount} flagged).`;
  }

  const watchMatches = findWatchlistMatches(rawQ);

  return {
    query: rawQ,
    detected: {
      agents: matchedAgents,
      channels: matchedChannels,
      misses: matchedMisses,
      intents: [wantsClean && "Clean", wantsMiss && "Misses", wantsHighImpact && "High-Impact", wantsMerged && "Merged"].filter(Boolean),
    },
    total,
    cleanCount,
    missCount,
    complianceRate,
    highImpactCount,
    aiBrief,
    tickets: matchingTickets,
    watchlist: watchMatches,
  };
}

function renderAiSearchTicketCards(tickets) {
  if (!tickets.length) {
    return `
      <div class="ios-empty-state">
        <span class="ios-empty-icon">&#128269;</span>
        <strong>No Results Found</strong>
        <span>Try adjusting your query terms or searching by Ticket ID.</span>
      </div>
    `;
  }

  return tickets.map((ticket) => {
    const tid = ticket.ticketId || ticket.id;
    const channelLower = (ticket.channel || "chat").toLowerCase();
    const isHighImpact = ticket._misses && (ticket._misses.length > 2 || ticket._misses.some((m) => ["Header Issue", "Blank Module", "Blank Feature", "Email No Hold", "Missing Jira"].includes(m)));

    return `
      <article class="ai-search-ticket-card">
        <div class="ai-ticket-card-header">
          <div class="ai-ticket-header-left">
            <div class="ios-ticket-id-wrap">
              ${renderTicketLink(tid)}
            </div>
            <div class="ai-ticket-agent-wrap">
              <strong class="ai-ticket-agent-name">${escapeHtml(ticket.agent || "Unknown Agent")}</strong>
              <span class="ai-ticket-date">${escapeHtml(ticket.date || "-")} &middot; ${escapeHtml(ticket._source || "Workbook")}</span>
            </div>
          </div>
          <div class="ai-ticket-header-right">
            <span class="ios-channel-badge ${channelLower}">${escapeHtml(ticket.channel || "Chat")}</span>
            ${ticket.score !== undefined ? `<span class="ios-score-badge">Score ${ticket.score}</span>` : ""}
            ${isHighImpact ? `<span class="ai-high-impact-pill">High-Impact</span>` : ""}
          </div>
        </div>

        <div class="ai-ticket-subject-row">
          <strong>Subject:</strong> <span>${escapeHtml(ticket.subject || "No subject recorded")}</span>
        </div>

        ${(ticket.module || ticket.feature || ticket.organization) ? `
          <div class="ai-ticket-module-row">
            ${ticket.module ? `<span>Module: <b>${escapeHtml(ticket.module)}</b></span>` : ""}
            ${ticket.feature ? `<span>Feature: <b>${escapeHtml(ticket.feature)}</b></span>` : ""}
            ${ticket.organization ? `<span>Org: <b>${escapeHtml(ticket.organization)}</b></span>` : ""}
          </div>
        ` : ""}

        <div class="ai-ticket-req-row">
          <span class="ai-req-label">Requirement Checks:</span>
          <div class="ai-req-pills">
            ${ticket._misses && ticket._misses.length ? ticket._misses.map((m) => `<span class="check-pill fail">&#10007; ${escapeHtml(m)}</span>`).join("") : `<span class="check-pill pass">&#10003; Clean (0 misses)</span>`}
          </div>
        </div>

        ${ticket._reasons && ticket._reasons.length ? `
          <div class="ai-ticket-rationale">
            <span class="ai-rationale-label">&#10024; AI Match Rationale:</span>
            <span class="ai-rationale-text">${escapeHtml(ticket._reasons.join(" &middot; "))}</span>
          </div>
        ` : ""}
      </article>
    `;
  }).join("");
}

function openAiSearchModal(initialQuery = "") {
  closeOpsModal();
  closeMetricModal();

  const query = initialQuery || "";
  const result = executeAiSearchQuery(query) || {
    query: "",
    detected: { agents: [], channels: [], misses: [], intents: [] },
    total: 0,
    cleanCount: 0,
    missCount: 0,
    complianceRate: 100,
    highImpactCount: 0,
    aiBrief: "Enter a ticket ID, agent name, support channel, requirement miss (e.g. Header Issue), or natural language query to begin AI Search.",
    tickets: [],
    watchlist: [],
  };

  const modal = document.createElement("div");
  modal.className = "modal-backdrop";
  modal.dataset.opsModal = "true";
  modal.dataset.aiSearchModal = "true";
  modal.innerHTML = `
    <section class="metric-modal ios-ai-search-modal" role="dialog" aria-modal="true" aria-label="AI Search Intelligence">
      <header class="ios-modal-header">
        <div class="ios-modal-title-group">
          <div class="ios-modal-badge tone-primary">
            <span class="ai-sparkle-icon">&#10024;</span>
          </div>
          <div>
            <strong class="ios-modal-title">AI Search Intelligence</strong>
            <span class="ios-modal-subtitle">${result.query ? `${result.total} results found for &ldquo;${escapeHtml(result.query)}&rdquo;` : "Intelligent Natural Language & Ticket Search Agent"}</span>
          </div>
        </div>
        <button type="button" class="ios-close-btn" data-close-ops aria-label="Close">&times;</button>
      </header>

      <div class="ai-search-briefing-box">
        <div class="ai-briefing-header">
          <strong class="ai-briefing-title"><span class="ai-sparkle-glyph">&#10024;</span> AI Search Agent Synthesis</strong>
          ${result.total > 0 ? `<span class="ai-compliance-pill ${result.complianceRate >= 80 ? "pass" : "fail"}">${result.complianceRate}% Compliance</span>` : ""}
        </div>
        <p class="ai-briefing-text">${escapeHtml(result.aiBrief)}</p>
        
        <div class="ai-detected-chips">
          ${result.detected.agents.map((a) => `<span class="ai-tag-chip agent">Agent: ${escapeHtml(a)}</span>`).join("")}
          ${result.detected.channels.map((c) => `<span class="ai-tag-chip channel">Channel: ${escapeHtml(c)}</span>`).join("")}
          ${result.detected.misses.map((m) => `<span class="ai-tag-chip miss">Miss: ${escapeHtml(m)}</span>`).join("")}
          ${result.detected.intents.map((i) => `<span class="ai-tag-chip intent">Filter: ${escapeHtml(i)}</span>`).join("")}
        </div>
      </div>

      <div class="ios-modal-search-bar">
        <span class="ios-search-icon">&#128269;</span>
        <input type="text" id="aiSearchModalInput" class="ios-search-input" value="${escapeHtml(result.query)}" placeholder="Refine query (e.g. Alice header issue, Voice score &lt; 85, clean tickets)..." />
        <button type="button" class="ios-pill-btn" id="aiSearchModalBtn">&#10024; Search</button>
      </div>

      <div class="ios-modal-content-wrap">
        <div class="ios-ticket-list" id="aiSearchModalResultsList">
          ${renderAiSearchTicketCards(result.tickets)}
        </div>
        ${result.watchlist.length ? renderWatchlistMatches(result.watchlist) : ""}
      </div>
    </section>
  `;
  document.body.appendChild(modal);
  document.querySelector("#aiSearchModalInput")?.focus();
}

function openTicketSearchModal() {
  openAiSearchModal("");
}

function renderTicketFullDetail(ticket) {
  const ticketId = ticket.id || ticket.ticketId;
  const misses = getTicketMisses(ticket);
  const rawTags = ticket.rawTags || [];
  return `
    <article class="memory-card">
      <div>
        <strong>${renderTicketLink(ticketId)}</strong>
        <span>${escapeHtml(ticket.date || "-")} | ${escapeHtml(ticket.agent || "-")} | ${escapeHtml(ticket.channel || "-")}</span>
      </div>
      ${ticket.isMergedChild ? `<div class="memory-line"><b>Status</b>: Merged ticket - not auditable</div>` : ""}
      <div class="memory-line"><b>Subject</b>: ${escapeHtml(ticket.subject || "-")}</div>
      <div class="memory-line"><b>Module</b>: ${escapeHtml(ticket.module || "-")} &nbsp; <b>Feature</b>: ${escapeHtml(ticket.feature || "-")}</div>
      ${ticket.organization ? `<div class="memory-line"><b>Organization</b>: ${escapeHtml(ticket.organization)}</div>` : ""}
      ${ticket.satisfaction ? `<div class="memory-line"><b>Satisfaction</b>: ${escapeHtml(ticket.satisfaction)}</div>` : ""}
      <div class="memory-line"><b>Requirement Check</b></div>
      <div class="memory-tags">
        ${misses.length ? misses.map((m) => `<span class="check-pill fail">&#10007; ${escapeHtml(m)}</span>`).join("") : `<span class="check-pill pass">&#10003; Clean</span>`}
      </div>
      ${rawTags.length ? `<div class="memory-line"><b>Worksheet tags</b>: ${escapeHtml(rawTags.join(", "))}</div>` : ""}
      <div class="memory-line muted">Score ${ticket.score ?? "-"}${
        ticket.copiedAt ? ` | Sampled on ${escapeHtml(formatDateTime(ticket.copiedAt))}` : ticket.uploadedAt ? ` | Stored on ${escapeHtml(formatDateTime(ticket.uploadedAt))}` : ""
      }</div>
    </article>
  `;
}

function extractTicketId(value) {
  const text = clean(value);
  const ticketPathMatch = text.match(/tickets\/(\d+)/i);
  if (ticketPathMatch) return ticketPathMatch[1];
  const numberMatch = text.match(/\d{4,}/);
  return numberMatch?.[0] || text;
}

function findTicketMemoryMatches(query) {
  const needle = clean(query);
  if (!needle) return [];
  const historyMatches = Object.values(samplerIntelligence)
    .map((ticket) => ({ ticket, distance: ticketMatchDistance(needle, ticket.id || ticket.ticketId) }))
    .filter((entry) => entry.distance <= Math.max(2, Math.floor(needle.length * 0.18)))
    .sort((a, b) => a.distance - b.distance || clean(b.ticket.copiedAt || b.ticket.uploadedAt).localeCompare(clean(a.ticket.copiedAt || a.ticket.uploadedAt)))
    .map((entry) => entry.ticket);
  const liveMatches = (currentPayload?.agents || [])
    .flatMap((agent) => agent.tickets)
    .filter((ticket) => ticketMatchDistance(needle, ticket.ticketId) <= 1);
  return uniqueTickets([...liveMatches, ...historyMatches]).slice(0, 8);
}

function ticketMatchDistance(query, ticketId) {
  const id = clean(ticketId);
  if (!id) return Infinity;
  if (id === query) return 0;
  if (id.includes(query) || query.includes(id)) return Math.abs(id.length - query.length);
  return levenshtein(id, query);
}

function uniqueTickets(tickets) {
  const seen = new Set();
  return tickets.filter((ticket) => {
    const key = clean(ticket.ticketId);
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function renderTicketMemoryCard(ticket) {
  const misses = getTicketMisses(ticket);
  const tags = ticket.tags?.length ? ticket.tags : misses;
  return `
    <article class="memory-card">
      <div>
        <strong>${renderTicketLink(ticket.ticketId)}</strong>
        <span>${escapeHtml(ticket.date || "-")} | ${escapeHtml(ticket.agent || "-")} | ${escapeHtml(ticket.channel || "-")}</span>
      </div>
      <div class="memory-line"><b>Prior finding</b>: ${escapeHtml(misses.length ? misses.join(", ") : "No major issue stored")}</div>
      <div class="memory-line"><b>Subject</b>: ${escapeHtml(ticket.subject || "-")}</div>
      <div class="memory-tags">${renderTags(tags)}</div>
      <div class="memory-line muted">Stored from ${escapeHtml(ticket.sourceFile || "uploaded N-1")} ${ticket.uploadedAt ? `on ${escapeHtml(formatDateTime(ticket.uploadedAt))}` : ""}</div>
    </article>
  `;
}

function findWatchlistMatches(query) {
  const needle = clean(query);
  if (!needle) return [];
  return watchlistItems
    .map((item) => ({ item, distance: ticketMatchDistance(needle, item.ticketId) }))
    .filter((entry) => entry.distance <= Math.max(2, Math.floor(needle.length * 0.18)))
    .sort((a, b) => a.distance - b.distance || clean(b.item.createdAt).localeCompare(clean(a.item.createdAt)))
    .map((entry) => entry.item);
}

function renderWatchlistMatches(items) {
  return `
    <section class="watchlist-matches">
      <strong>Watchlist notes</strong>
      ${items.map((item) => `
        <article class="memory-card compact">
          <div>
            <strong>${renderTicketLink(item.ticketId)}</strong>
            <span>${escapeHtml(item.snapshot?.agent || item.assignee || "-")} | ${escapeHtml(formatDateTime(item.createdAt))}</span>
          </div>
          <div class="memory-line">${escapeHtml(item.note || item.feedback || "-")}</div>
        </article>
      `).join("")}
    </section>
  `;
}

function openWatchlistModal() {
  openOpsModal(
    "Ticket Watchlist",
    "Track tickets worth remembering - snapshot, note, and status, all in one place.",
    renderWatchlistPanel(),
  );
}

function refreshWatchlistPanel() {
  const body = document.querySelector(".ops-panel-body");
  if (body) body.innerHTML = renderWatchlistPanel();
}

// A watchlist item's ticket context can drift or disappear from later
// uploads, so the snapshot captured at add-time is what's shown here -
// not a live lookup - per the "preserve context even if the workbook
// changes later" requirement.
function renderWatchCard(item) {
  const resolved = item.status === "Resolved";
  const snap = item.snapshot;
  const agent = snap?.agent || item.assignee || "";
  const badges = snap?.badges?.length ? snap.badges.slice(0, 3).join(", ") : "";
  return `
    <article class="watch-card ${resolved ? "watch-card-resolved" : ""}">
      <div class="watch-card-top">
        <strong>${renderTicketLink(item.ticketId)}</strong>
        <span class="watch-status ${resolved ? "watch-status-resolved" : "watch-status-active"}">${resolved ? "Resolved" : "Active"}</span>
      </div>
      <div class="watch-card-meta">
        ${agent ? `<span>${escapeHtml(agent)}</span>` : ""}
        ${snap?.module ? `<span>${escapeHtml(snap.module)}</span>` : ""}
        ${snap?.channel ? `<span>${escapeHtml(snap.channel)}</span>` : ""}
      </div>
      ${badges ? `<div class="watch-card-badges">${escapeHtml(badges)}</div>` : ""}
      <p class="watch-card-note">${escapeHtml(item.note || item.feedback || "-")}</p>
      <div class="watch-card-foot">
        <span>Added ${escapeHtml(formatShortDate(item.createdAt))}</span>
        <div class="watch-card-actions">
          <button type="button" class="ops-action-inline" data-watch-edit="${escapeHtml(item.id)}">Edit note</button>
          ${
            resolved
              ? `<button type="button" class="ops-action-inline" data-watch-reactivate="${escapeHtml(item.id)}">Reactivate</button>`
              : `<button type="button" class="ops-action-inline" data-watch-resolve="${escapeHtml(item.id)}">Mark resolved</button>`
          }
          <button type="button" class="ops-action-inline" data-watch-delete="${escapeHtml(item.id)}">Remove</button>
        </div>
      </div>
    </article>
  `;
}

function renderWatchlistPanel() {
  const sorted = watchlistItems.slice().sort((a, b) => clean(b.createdAt).localeCompare(clean(a.createdAt)));
  const cards = sorted.length ? sorted.map(renderWatchCard).join("") : `<div class="empty">No tickets on the watchlist yet.</div>`;
  return `
    <div class="watch-form">
      <input id="watchTicketInput" class="ops-input" type="text" placeholder="Ticket ID or Zendesk link (required)" />
      <textarea id="watchNoteInput" class="ops-textarea" rows="2" placeholder="Short note - why watch this? (required)"></textarea>
      <button class="primary-action" type="button" data-watch-save>Add to Watchlist</button>
    </div>
    <div class="watchlist-cards">${cards}</div>
  `;
}

// Snapshot is captured once, at add-time, from whatever is currently
// loaded - it deliberately does NOT re-resolve on every render, so it
// keeps showing the ticket's context even after a newer workbook upload
// changes or removes that ticket.
function buildWatchSnapshot(ticketId) {
  const ticket = (currentPayload?.agents || []).flatMap((agent) => agent.tickets).find((t) => clean(t.ticketId) === ticketId);
  if (!ticket) return null;
  return {
    agent: ticket.agent,
    auditor: ticket.auditor,
    channel: ticket.channel,
    module: ticket.module,
    feature: ticket.feature,
    date: ticket.date,
    badges: buildRequirementDisplay(ticket).map((entry) => entry.label),
  };
}

function saveWatchlistFromModal() {
  const ticketInput = document.querySelector("#watchTicketInput");
  const noteInput = document.querySelector("#watchNoteInput");
  const ticketId = extractTicketId(ticketInput?.value || "");
  const note = clean(noteInput?.value);

  ticketInput?.classList.toggle("input-error", !ticketId);
  noteInput?.classList.toggle("input-error", !note);
  if (!ticketId || !note) {
    (ticketId ? noteInput : ticketInput)?.focus();
    return;
  }

  const newItem = {
    id: `${Date.now()}-${Math.random().toString(16).slice(2)}`,
    ticketId,
    note,
    status: "Active",
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    snapshot: buildWatchSnapshot(ticketId),
  };
  watchlistItems.unshift(newItem);
  saveWatchlist();
  refreshWatchlistPanel();
  render();
}

function deleteWatchlistItem(id) {
  watchlistItems = watchlistItems.filter((item) => item.id !== id);
  saveWatchlist();
  refreshWatchlistPanel();
  render();
}

function setWatchlistItemStatus(id, status) {
  const item = watchlistItems.find((entry) => entry.id === id);
  if (!item) return;
  item.status = status;
  item.updatedAt = new Date().toISOString();
  saveWatchlist();
  refreshWatchlistPanel();
  render();
}

function editWatchlistNote(id) {
  const item = watchlistItems.find((entry) => entry.id === id);
  if (!item) return;
  const updated = prompt("Update watchlist note:", item.note || item.feedback || "");
  if (updated === null) return; // cancelled
  const trimmed = clean(updated);
  if (!trimmed) return; // note stays mandatory - ignore an empty save
  item.note = trimmed;
  item.updatedAt = new Date().toISOString();
  saveWatchlist();
  refreshWatchlistPanel();
}

function formatShortDate(iso) {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "-";
  return date.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

// Single choke point for "does this ticket have a watchlist entry" -
// renderTicketLink reads through this, which is why the indicator shows up
// everywhere a ticket link renders (main tables, search, agent drilldowns)
// without each of those call sites needing to know about watchlist at all.
function findWatchlistItem(ticketId) {
  const id = clean(ticketId);
  if (!id) return null;
  return watchlistItems.find((item) => clean(item.ticketId) === id) || null;
}

function countActiveWatchForAgent(agentName) {
  return watchlistItems.filter((item) => item.status !== "Resolved" && item.snapshot?.agent === agentName).length;
}

function renderAgentWatchBadge(agentName) {
  const count = countActiveWatchForAgent(agentName);
  if (!count) return "";
  return ` <span class="agent-watch-badge" title="${count} active watched ticket${count === 1 ? "" : "s"}">${WATCH_ICON_SVG}${count}</span>`;
}

function openSopModal() {
  openOpsModal(
    "SOP Guidance",
    "Fast operational reminders while sampling.",
    `
      <div class="guidance-grid">
        <article class="guidance-card">
          <strong>Header format</strong>
          <span>Prefer Module - issue description. Prioritize repeated default Conversation with subjects or unclear headers.</span>
        </article>
        <article class="guidance-card">
          <strong>Voice sampling</strong>
          <span>Inbound calls first. Calls over 12 minutes are stronger, 10+ minutes are usable, and shorter calls are fallback picks.</span>
        </article>
        <article class="guidance-card">
          <strong>Email sampling</strong>
          <span>For email, unresolved or blank resolution time with no hold reason is worth reviewing.</span>
        </article>
        <article class="guidance-card">
          <strong>Clean ticket basics</strong>
          <span>Watch blank module, blank feature, missing organization, low CSAT, default subject, and suspicious call time gaps.</span>
        </article>
        <article class="guidance-card">
          <strong>Manual learning</strong>
          <span>Cross out weak suggestions and use Watchlist feedback so recurring misses become easier to spot later.</span>
        </article>
        <article class="guidance-card">
          <strong>Copy row</strong>
          <span>The copy output is Date, Week of year, Month, Ticket ID, Agent, Module, Feature, and Support Channel.</span>
        </article>
      </div>
    `,
  );
}

function formatDateTime(value) {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return clean(value);
  return date.toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function getMonthKey(dateText) {
  const date = parseDateText(dateText);
  if (!date) return "Unknown";
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`;
}

function parseDateText(dateText) {
  const text = clean(dateText);
  const slashMatch = text.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (slashMatch) {
    return new Date(Date.UTC(Number(slashMatch[3]), Number(slashMatch[1]) - 1, Number(slashMatch[2])));
  }
  const isoMatch = text.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (isoMatch) {
    return new Date(Date.UTC(Number(isoMatch[1]), Number(isoMatch[2]) - 1, Number(isoMatch[3])));
  }
  return null;
}

function formatLongDate(date) {
  return date.toLocaleDateString("en-US", {
    timeZone: "UTC",
    month: "long",
    day: "numeric",
    weekday: "long",
  });
}

function formatMonthName(monthKey) {
  if (monthKey === "Unknown") return "Unknown month";
  const [year, month] = monthKey.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, 1)).toLocaleDateString("en-US", {
    timeZone: "UTC",
    month: "long",
    year: "numeric",
  });
}

function getMonthWindow(monthKey) {
  if (monthKey === "Unknown") return "Unknown date window";
  const [year, month] = monthKey.split("-").map(Number);
  const start = new Date(Date.UTC(year, month - 1, 1));
  const end = new Date(Date.UTC(year, month, 0));
  while (end.getUTCDay() !== 5) {
    end.setUTCDate(end.getUTCDate() - 1);
  }
  return `${formatLongDate(start)} to ${formatLongDate(end)}`;
}

function buildMonthlySummary(agentName) {
  const tickets = Object.values(samplerIntelligence)
    .filter((ticket) => ticket.agent === agentName)
    .sort((a, b) => clean(a.date).localeCompare(clean(b.date)) || clean(a.id || a.ticketId).localeCompare(clean(b.id || b.ticketId)));
  const grouped = {};
  for (const ticket of tickets) {
    const key = (ticket.date ? computeQaMonthKey(ticket.date) : null) || ticket.monthKey || getMonthKey(ticket.date);
    grouped[key] ||= [];
    grouped[key].push(ticket);
  }
  return Object.entries(grouped)
    .sort(([a], [b]) => b.localeCompare(a))
    .map(([monthKey, monthTickets]) => ({
      monthKey,
      label: formatMonthLabel(monthKey) || formatMonthName(monthKey),
      window: getMonthWindow(monthKey),
      total: monthTickets.length,
      channels: countBy(monthTickets, (ticket) => ticket.channel),
      misses: getMajorMisses(monthTickets),
      tickets: monthTickets,
      cleanRate: getCleanRate(monthTickets),
    }));
}

function countBy(items, selector) {
  return items.reduce((counts, item) => {
    const key = selector(item) || "Unknown";
    counts[key] = (counts[key] || 0) + 1;
    return counts;
  }, {});
}

function getCleanRate(tickets) {
  if (!tickets.length) return 0;
  const cleanTickets = tickets.filter((ticket) => getTicketMisses(ticket).length === 0).length;
  return Math.round((cleanTickets / tickets.length) * 100);
}

function getTicketMisses(ticket) {
  if (!ticket) return [];
  if (Array.isArray(ticket.misses)) return ticket.misses;
  const activeChecks = new Set(
    (ticket.checks || [])
      .filter((check) => check && check.active)
      .map((check) => clean(check.label).toLowerCase())
  );
  const tags = new Set((ticket.tags || []).map((t) => clean(t).toLowerCase()));
  const misses = [];

  if (activeChecks.has("default subject") || tags.has("default subject")) misses.push("Default Subject");
  if (activeChecks.has("generated subject") || tags.has("generated subject")) misses.push("Generated Subject");
  if (activeChecks.has("header issue") || tags.has("header issue")) misses.push("Header Issue");
  if (activeChecks.has("module blank") || tags.has("blank module")) misses.push("Blank Module");
  if (activeChecks.has("feature blank") || tags.has("blank feature")) misses.push("Blank Feature");
  if (activeChecks.has("organization blank") || tags.has("missing org") || tags.has("blank org")) misses.push("Missing Org");
  if (activeChecks.has("email unresolved/no hold") || tags.has("email no hold")) misses.push("Email No Hold");
  if (activeChecks.has("talk time mismatch") || tags.has("suspicious talk time")) misses.push("Suspicious Talk Time");
  if (activeChecks.has("unsatisfied") || tags.has("low csat") || tags.has("bad csat")) misses.push("Low CSAT");
  if (activeChecks.has("missing jira") || tags.has("missing jira")) misses.push("Missing Jira");

  return misses;
}

function getMajorMisses(tickets) {
  const missAdvice = {
    "Default Subject": "Stop leaving ticket subjects as the default Conversation with title; rename them to the actual issue.",
    "Generated Subject": "Stop leaving voice/email subjects as generated call, missed-call, form, or timestamp titles; rename them to Module - issue description.",
    "Header Issue": "Stop using headers that do not follow the Module - issue description format.",
    "Blank Module": "Stop submitting tickets without module/category selection.",
    "Blank Feature": "Stop submitting tickets without the feature/category detail.",
    "Missing Org": "Stop leaving organization blank when the customer account is identifiable.",
    "Email No Hold": "For unresolved emails, stop leaving both resolution time and hold reason blank.",
    "Suspicious Talk Time": "Review calls where talk time is far lower than total call duration.",
    "Low CSAT": "Review low-satisfaction tickets for communication, ownership, and closure quality.",
    "Missing Jira": "Attach JIRA defect/improvement link when escalating software bugs.",
  };
  const counts = {};
  for (const ticket of tickets) {
    for (const miss of getTicketMisses(ticket)) {
      counts[miss] = (counts[miss] || 0) + 1;
    }
  }
  return Object.entries(counts)
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .map(([name, count]) => ({
      name,
      count,
      rate: tickets.length ? Math.round((count / tickets.length) * 100) : 0,
      severity: count >= 3 || count / Math.max(tickets.length, 1) >= 0.3 ? "Regular default" : "Occasional",
      advice: missAdvice[name] || "Follow standard QA workflow.",
    }));
}

// Phase 6 Operational Intelligence: Channel x Miss Breakdown
function buildChannelMissBreakdown(tickets) {
  const channels = ["Chat", "Voice", "Email"];
  const breakdown = {};
  for (const ch of channels) {
    const chTickets = tickets.filter((t) => t.channel === ch);
    const missCounts = {};
    for (const t of chTickets) {
      for (const m of getTicketMisses(t)) {
        missCounts[m] = (missCounts[m] || 0) + 1;
      }
    }
    const total = chTickets.length;
    const clean = chTickets.filter((t) => getTicketMisses(t).length === 0).length;
    const cleanRate = total ? Math.round((clean / total) * 100) : 0;
    breakdown[ch] = {
      channel: ch,
      total,
      clean,
      cleanRate,
      misses: Object.entries(missCounts).map(([name, count]) => ({ name, count })).sort((a, b) => b.count - a.count),
    };
  }
  return breakdown;
}

// ================= Phase 5: Analytics & Intelligence Engine =================

const defaultCompletedWeek = getMostRecentCompletedReportingWeek();
var activeAnalyticsTab = "performance";
var activePerformancePeriod = "week";
var activeAnalyticsYear = defaultCompletedWeek.year;
var activeAnalyticsWeek = defaultCompletedWeek.weekNumber;
var activeAnalyticsMonth = computeQaMonthKey(defaultCompletedWeek.dateKey);
var activeAnalyticsQuarter = computeQaQuarterKey(defaultCompletedWeek.dateKey);

let intelSearchQuery = "";
let intelPeriodFilter = "all";
let intelAuditorFilter = "all";
let intelAgentFilter = "all";
let intelChannelFilter = "all";
let intelCleanFilter = "all";

// Phase 5B: Weekly Analytics Engine
function buildWeeklyAnalytics(year, weekNumber) {
  const targetYear = Number(year) || new Date().getFullYear();
  const targetWeek = Number(weekNumber) || 1;
  const allTickets = Object.values(samplerIntelligence);

  const priorWeekNum = targetWeek > 1 ? targetWeek - 1 : 52;
  const priorYear = targetWeek > 1 ? targetYear : targetYear - 1;

  const tickets = [];
  const priorTickets = [];

  for (const ticket of allTickets) {
    if (!ticket.date) continue;
    const w = computeQaWeekNumber(ticket.date);
    let y = dateKeyToDate(ticket.date).getFullYear();
    const anchor = getReportingYearAnchorKey(y);
    if (ticket.date < anchor) y -= 1;
    if (w === targetWeek && y === targetYear) tickets.push(ticket);
    else if (w === priorWeekNum && y === priorYear) priorTickets.push(ticket);
  }

  const popRecords = [];
  for (const r of Object.values(workbookRequirementIntelligence)) {
    if (!r.samplingDate) continue;
    if (r.qaWeek !== undefined && r.qaQuarter !== undefined) {
      const recYear = Number(r.qaQuarter.slice(0, 4));
      if (r.qaWeek === targetWeek && recYear === targetYear) popRecords.push(r);
    } else {
      let y = dateKeyToDate(r.samplingDate).getFullYear();
      const anchor = getReportingYearAnchorKey(y);
      if (r.samplingDate < anchor) y -= 1;
      const w = computeQaWeekNumber(r.samplingDate);
      if (w === targetWeek && y === targetYear) popRecords.push(r);
    }
  }
  const population = rollupPopulationRequirementIntelligence(popRecords);

  const totalSampled = tickets.length;
  const cleanCount = tickets.filter((t) => getTicketMisses(t).length === 0).length;
  const missedCount = totalSampled - cleanCount;
  const cleanRate = totalSampled ? Math.round((cleanCount / totalSampled) * 100) : 0;
  const channels = countBy(tickets, (t) => t.channel);
  const misses = getMajorMisses(tickets);

  const agentMap = {};
  for (const t of tickets) {
    agentMap[t.agent] ||= [];
    agentMap[t.agent].push(t);
  }
  const agents = Object.entries(agentMap)
    .map(([agent, agentTickets]) => ({
      agent,
      total: agentTickets.length,
      clean: agentTickets.filter((t) => getTicketMisses(t).length === 0).length,
      cleanRate: getCleanRate(agentTickets),
      channels: countBy(agentTickets, (t) => t.channel),
      misses: getMajorMisses(agentTickets),
      tickets: agentTickets,
    }))
    .sort((a, b) => a.cleanRate - b.cleanRate || b.total - a.total);

  const auditorMap = {};
  for (const t of tickets) {
    const aud = t.auditor || "Unknown";
    auditorMap[aud] ||= [];
    auditorMap[aud].push(t);
  }
  const auditors = Object.entries(auditorMap)
    .map(([auditor, audTickets]) => ({
      auditor,
      total: audTickets.length,
      clean: audTickets.filter((t) => getTicketMisses(t).length === 0).length,
      cleanRate: getCleanRate(audTickets),
      channels: countBy(audTickets, (t) => t.channel),
    }))
    .sort((a, b) => b.total - a.total);

  const priorTotal = priorTickets.length;
  const priorCleanRate = priorTotal ? getCleanRate(priorTickets) : null;
  const wowDelta = (priorCleanRate !== null && totalSampled > 0) ? cleanRate - priorCleanRate : null;

  return {
    periodType: "week",
    year: targetYear,
    weekNumber: targetWeek,
    label: `Week ${targetWeek} (${targetYear})`,
    window: getWeekWindow(targetWeek, targetYear),
    population,
    totalSampled,
    cleanCount,
    missedCount,
    cleanRate,
    channels,
    channelMisses: buildChannelMissBreakdown(tickets),
    misses,
    agents,
    auditors,
    priorTotal,
    priorCleanRate,
    wowDelta,
    tickets,
  };
}

// Phase 5C: Monthly Analytics Engine
function buildMonthlyAnalytics(monthKey) {
  const allTickets = Object.values(samplerIntelligence);
  const tickets = allTickets.filter((ticket) => computeQaMonthKey(ticket.date) === monthKey);

  const popRecords = Object.values(workbookRequirementIntelligence).filter((r) => computeQaMonthKey(r.samplingDate) === monthKey);
  const population = rollupPopulationRequirementIntelligence(popRecords);

  const totalSampled = tickets.length;
  const cleanCount = tickets.filter((t) => getTicketMisses(t).length === 0).length;
  const missedCount = totalSampled - cleanCount;
  const cleanRate = totalSampled ? Math.round((cleanCount / totalSampled) * 100) : 0;
  const channels = countBy(tickets, (t) => t.channel);
  const misses = getMajorMisses(tickets);

  const agentMap = {};
  for (const t of tickets) {
    agentMap[t.agent] ||= [];
    agentMap[t.agent].push(t);
  }
  const agents = Object.entries(agentMap)
    .map(([agent, agentTickets]) => ({
      agent,
      total: agentTickets.length,
      clean: agentTickets.filter((t) => getTicketMisses(t).length === 0).length,
      cleanRate: getCleanRate(agentTickets),
      channels: countBy(agentTickets, (t) => t.channel),
      misses: getMajorMisses(agentTickets),
      tickets: agentTickets,
    }))
    .sort((a, b) => a.cleanRate - b.cleanRate || b.total - a.total);

  const auditorMap = {};
  for (const t of tickets) {
    const aud = t.auditor || "Unknown";
    auditorMap[aud] ||= [];
    auditorMap[aud].push(t);
  }
  const auditors = Object.entries(auditorMap)
    .map(([auditor, audTickets]) => ({
      auditor,
      total: audTickets.length,
      clean: audTickets.filter((t) => getTicketMisses(t).length === 0).length,
      cleanRate: getCleanRate(audTickets),
      channels: countBy(audTickets, (t) => t.channel),
    }))
    .sort((a, b) => b.total - a.total);

  const priorMonthKey = shiftMonthKey(monthKey, -1);
  const priorTickets = allTickets.filter((ticket) => computeQaMonthKey(ticket.date) === priorMonthKey);
  const priorTotal = priorTickets.length;
  const priorCleanRate = priorTotal ? getCleanRate(priorTickets) : null;
  const momDelta = (priorCleanRate !== null && totalSampled > 0) ? cleanRate - priorCleanRate : null;

  return {
    periodType: "month",
    monthKey,
    label: formatMonthLabel(monthKey) || formatMonthName(monthKey),
    window: getMonthWindow(monthKey),
    population,
    totalSampled,
    cleanCount,
    missedCount,
    cleanRate,
    channels,
    channelMisses: buildChannelMissBreakdown(tickets),
    misses,
    agents,
    auditors,
    priorTotal,
    priorCleanRate,
    momDelta,
    tickets,
  };
}

// Phase 5D: Quarterly Analytics Engine
function buildQuarterlyAnalytics(quarterKey) {
  const details = getQuarterDetails(quarterKey);
  const [yearStr] = quarterKey.split("-");
  const targetYear = Number(yearStr) || new Date().getFullYear();
  const allTickets = Object.values(samplerIntelligence);

  const popRecords = Object.values(workbookRequirementIntelligence).filter((r) => {
    if (!r.samplingDate) return false;
    let y = dateKeyToDate(r.samplingDate).getFullYear();
    const anchor = getReportingYearAnchorKey(y);
    if (r.samplingDate < anchor) y -= 1;
    const w = computeQaWeekNumber(r.samplingDate);
    return w >= details.startWeek && w <= details.endWeek && y === targetYear;
  });
  const population = rollupPopulationRequirementIntelligence(popRecords);

  const tickets = allTickets.filter((ticket) => {
    if (!ticket.date) return false;
    const w = computeQaWeekNumber(ticket.date);
    let y = dateKeyToDate(ticket.date).getFullYear();
    const anchor = getReportingYearAnchorKey(y);
    if (ticket.date < anchor) y -= 1;
    return w >= details.startWeek && w <= details.endWeek && y === targetYear;
  });

  const totalSampled = tickets.length;
  const cleanCount = tickets.filter((t) => getTicketMisses(t).length === 0).length;
  const missedCount = totalSampled - cleanCount;
  const cleanRate = totalSampled ? Math.round((cleanCount / totalSampled) * 100) : 0;
  const channels = countBy(tickets, (t) => t.channel);
  const misses = getMajorMisses(tickets);

  const ticketsByWeek = {};
  for (const t of tickets) {
    const w = computeQaWeekNumber(t.date);
    ticketsByWeek[w] ||= [];
    ticketsByWeek[w].push(t);
  }
  const weeklyTrend = [];
  for (let w = details.startWeek; w <= details.endWeek; w++) {
    const weekTickets = ticketsByWeek[w] || [];
    const weekTotal = weekTickets.length;
    const weekClean = weekTickets.filter((t) => getTicketMisses(t).length === 0).length;
    weeklyTrend.push({
      weekNumber: w,
      total: weekTotal,
      cleanCount: weekClean,
      cleanRate: weekTotal ? Math.round((weekClean / weekTotal) * 100) : null,
    });
  }

  const agentMap = {};
  for (const t of tickets) {
    agentMap[t.agent] ||= [];
    agentMap[t.agent].push(t);
  }
  const agents = Object.entries(agentMap)
    .map(([agent, agentTickets]) => ({
      agent,
      total: agentTickets.length,
      clean: agentTickets.filter((t) => getTicketMisses(t).length === 0).length,
      cleanRate: getCleanRate(agentTickets),
      channels: countBy(agentTickets, (t) => t.channel),
      misses: getMajorMisses(agentTickets),
      tickets: agentTickets,
    }))
    .sort((a, b) => a.cleanRate - b.cleanRate || b.total - a.total);

  const auditorMap = {};
  for (const t of tickets) {
    const aud = t.auditor || "Unknown";
    auditorMap[aud] ||= [];
    auditorMap[aud].push(t);
  }
  const auditors = Object.entries(auditorMap)
    .map(([auditor, audTickets]) => ({
      auditor,
      total: audTickets.length,
      clean: audTickets.filter((t) => getTicketMisses(t).length === 0).length,
      cleanRate: getCleanRate(audTickets),
      channels: countBy(audTickets, (t) => t.channel),
    }))
    .sort((a, b) => b.total - a.total);

  const priorQKey = getPriorQuarterKey(quarterKey);
  const priorDetails = getQuarterDetails(priorQKey);
  const [priorYStr] = priorQKey.split("-");
  const priorYear = Number(priorYStr);
  const priorTickets = allTickets.filter((ticket) => {
    if (!ticket.date) return false;
    const w = computeQaWeekNumber(ticket.date);
    let y = dateKeyToDate(ticket.date).getFullYear();
    const anchor = getReportingYearAnchorKey(y);
    if (ticket.date < anchor) y -= 1;
    return w >= priorDetails.startWeek && w <= priorDetails.endWeek && y === priorYear;
  });
  const priorTotal = priorTickets.length;
  const priorCleanRate = priorTotal ? getCleanRate(priorTickets) : null;
  const qoqDelta = (priorCleanRate !== null && totalSampled > 0) ? cleanRate - priorCleanRate : null;

  return {
    periodType: "quarter",
    quarterKey,
    label: details.label,
    population,
    totalSampled,
    cleanCount,
    missedCount,
    cleanRate,
    channels,
    channelMisses: buildChannelMissBreakdown(tickets),
    misses,
    agents,
    auditors,
    weeklyTrend,
    priorTotal,
    priorCleanRate,
    qoqDelta,
    tickets,
  };
}

var expandedSystemicMiss = null;
var expandedAgentDrilldown = null;
var activeAiSummaryPeriodType = "week";
var activeAiSummaryDate = todayDateKey();
var activeTicketPopover = null;

function shiftDayKey(dateKey, days) {
  const d = dateKeyToDate(dateKey);
  d.setDate(d.getDate() + days);
  return dateToKey(d);
}

function buildDailyAnalytics(dateKey) {
  const normDateKey = normalizeDateKey(dateKey) || todayDateKey();
  const allTickets = Object.values(samplerIntelligence);
  const tickets = allTickets.filter((ticket) => normalizeDateKey(ticket.date) === normDateKey);

  const popRecord = workbookRequirementIntelligence[normDateKey];
  const popRecords = popRecord ? [popRecord] : [];
  const population = rollupPopulationRequirementIntelligence(popRecords);

  const totalSampled = tickets.length;
  const cleanCount = tickets.filter((t) => getTicketMisses(t).length === 0).length;
  const missedCount = totalSampled - cleanCount;
  const cleanRate = totalSampled ? Math.round((cleanCount / totalSampled) * 100) : 0;
  const channels = countBy(tickets, (t) => t.channel);
  const misses = getMajorMisses(tickets);

  const agentMap = {};
  for (const t of tickets) {
    agentMap[t.agent] ||= [];
    agentMap[t.agent].push(t);
  }
  const agents = Object.entries(agentMap)
    .map(([agent, agentTickets]) => ({
      agent,
      total: agentTickets.length,
      clean: agentTickets.filter((t) => getTicketMisses(t).length === 0).length,
      cleanRate: getCleanRate(agentTickets),
      channels: countBy(agentTickets, (t) => t.channel),
      misses: getMajorMisses(agentTickets),
      tickets: agentTickets,
    }))
    .sort((a, b) => a.cleanRate - b.cleanRate || b.total - a.total);

  return {
    periodType: "day",
    dateKey: normDateKey,
    label: formatWorksheetDateLabel(normDateKey),
    population,
    totalSampled,
    cleanCount,
    missedCount,
    cleanRate,
    channels,
    channelMisses: buildChannelMissBreakdown(tickets),
    misses,
    agents,
    tickets,
  };
}

function isHighImpactTicket(ticket) {
  const misses = Array.isArray(ticket.misses) ? ticket.misses : getTicketMisses(ticket);
  if (misses.length > 2) return true;
  if (misses.some((m) => m === "Header Issue" || m === "Blank Module" || m === "Blank Feature" || m === "Email No Hold" || m === "Missing Jira")) return true;
  return false;
}

function getMissTicketsForCategory(analytics, missCategory) {
  const popTickets = (analytics.population?.missTickets || []).filter((t) => (t.misses || []).includes(missCategory));
  if (popTickets.length) return popTickets;
  const sampled = (analytics.tickets || []).filter((t) => getTicketMisses(t).includes(missCategory));
  return sampled.map((t) => ({
    id: t.id || t.ticketId,
    agent: t.agent,
    channel: t.channel,
    date: t.date,
    misses: getTicketMisses(t),
  }));
}

function getAgentMissTickets(analytics, agentName) {
  const popTickets = (analytics.population?.missTickets || []).filter((t) => t.agent === agentName);
  if (popTickets.length) return popTickets;
  const sampled = (analytics.tickets || []).filter((t) => t.agent === agentName && getTicketMisses(t).length > 0);
  return sampled.map((t) => ({
    id: t.id || t.ticketId,
    agent: t.agent,
    channel: t.channel,
    date: t.date,
    misses: getTicketMisses(t),
  }));
}

function getAgentHighImpactTickets(analytics, agentName) {
  const popTickets = (analytics.population?.missTickets || []).filter((t) => t.agent === agentName && isHighImpactTicket(t));
  if (popTickets.length) return popTickets;
  const sampled = (analytics.tickets || []).filter((t) => t.agent === agentName && isHighImpactTicket(t));
  return sampled.map((t) => ({
    id: t.id || t.ticketId,
    agent: t.agent,
    channel: t.channel,
    date: t.date,
    misses: getTicketMisses(t),
  }));
}

// Phase 5E: Deterministic AI Management Summary Generator
function generateAiManagementSummary(analytics) {
  const pop = analytics?.population;
  const hasPopData = pop && pop.hasData && pop.totalEligible > 0;
  const hasSampledData = analytics && analytics.totalSampled > 0;

  if (!hasPopData && !hasSampledData) {
    return `
      <div class="ai-summary-box">
        <div class="ai-summary-header">
          <strong>AI Management Summary</strong>
          <span class="ai-summary-badge">${escapeHtml(analytics?.label || "No Data")}</span>
        </div>
        <p class="muted">No workbook or sampled tickets recorded for this period. Upload daily worksheets and sample picks to generate an AI management summary.</p>
      </div>
    `;
  }

  const { totalSampled, cleanCount, cleanRate, misses, agents, channels, wowDelta, momDelta, qoqDelta } = analytics;
  const delta = wowDelta ?? momDelta ?? qoqDelta;
  const deltaType = wowDelta !== undefined ? "WoW" : momDelta !== undefined ? "MoM" : "QoQ";

  let trendText = "";
  if (delta !== null) {
    if (delta > 0) {
      trendText = ` Sampled cleanliness improved by <strong>+${delta}% ${deltaType}</strong> compared to the previous period.`;
    } else if (delta < 0) {
      trendText = ` Sampled cleanliness declined by <strong>${delta}% ${deltaType}</strong> compared to the previous period.`;
    } else {
      trendText = ` Sampled cleanliness held steady at <strong>0% ${deltaType}</strong> change compared to the previous period.`;
    }
  }

  const effectiveMisses = hasPopData ? pop.misses : misses;
  const topMisses = effectiveMisses.slice(0, 3);
  const missItemsHtml = topMisses.length
    ? topMisses
        .map(
          (m) =>
            `<li><strong>${escapeHtml(m.name)}</strong>: ${m.count} affected tickets (${m.rate}% miss rate across analyzed tickets). <em>Action:</em> Stop this pattern across daily ticket logging.</li>`,
        )
        .join("")
    : `<li>No recurring requirement check misses recorded in this period.</li>`;

  const popAgentsList = hasPopData ? Object.values(pop.agents) : [];
  const topAgents = popAgentsList.filter((a) => a.cleanRate >= 90 && a.total >= 3).slice(-3).reverse();
  const coachingAgents = popAgentsList.filter((a) => a.missRate > 20 && a.total >= 3).slice(0, 3);

  const topAgentsHtml = topAgents.length
    ? topAgents.map((a) => `<li><strong>${escapeHtml(a.agent)}</strong>: ${a.cleanRate}% clean (${a.clean}/${a.total} analyzed tickets)</li>`).join("")
    : `<li>All active agents maintain balanced requirement adherence.</li>`;

  const coachingAgentsHtml = coachingAgents.length
    ? coachingAgents.map((a) => `<li><strong>${escapeHtml(a.agent)}</strong>: ${a.missRate}% miss rate (${a.missed} misses across ${a.total} analyzed tickets). Top issue: <em>${escapeHtml(a.misses[0]?.name || "Requirement Misses")}</em></li>`).join("")
    : `<li>No agents exceeded the 20% miss rate coaching threshold.</li>`;

  const channelList = hasPopData
    ? Object.entries(pop.channels).map(([c, data]) => `${c}: ${data.total} analyzed (${data.cleanRate}% clean, ${data.missRate}% missed)`).join(" | ")
    : Object.entries(channels).map(([c, count]) => `${c}: ${count} samples (${Math.round((count / Math.max(totalSampled, 1)) * 100)}%)`).join(" | ");

  return `
    <div class="ai-summary-box">
      <div class="ai-summary-header">
        <strong>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none"><path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>
          AI Management Summary &middot; ${escapeHtml(analytics.label)}
        </strong>
        <span class="ai-summary-badge">${hasPopData ? `${pop.cleanRate}% Team Cleanliness` : `${cleanRate}% Cleanliness`}</span>
      </div>

      <div class="ai-summary-section">
        <h4>1. Executive Requirement &amp; Sampling Overview</h4>
        <p>
          ${hasPopData ? `Across <strong>${pop.totalEligible.toLocaleString()}</strong> eligible tickets analyzed in N-1 workbooks for this period, the team requirement cleanliness rate was <strong>${pop.cleanRate}%</strong> (${pop.cleanCount.toLocaleString()} clean tickets, <strong>${pop.missedCount.toLocaleString()}</strong> with requirement check issues). ` : ""}
          From these tickets, <strong>${totalSampled}</strong> audit tickets were sampled with a sampled cleanliness rate of <strong>${cleanRate}%</strong> (${cleanCount} clean picks).${trendText}
        </p>
      </div>

      <div class="ai-summary-section">
        <h4>2. Primary Systemic Misses &amp; SOP Directives</h4>
        <ul>${missItemsHtml}</ul>
      </div>

      <div class="ai-summary-section">
        <h4>3. Agent Quality &amp; Coaching Priorities</h4>
        <p><strong>Strongest Requirement Cleanliness:</strong></p>
        <ul>${topAgentsHtml}</ul>
        <p style="margin-top: 6px;"><strong>Coaching Focus Areas (Highest Miss Rate across Analyzed Tickets):</strong></p>
        <ul>${coachingAgentsHtml}</ul>
      </div>

      <div class="ai-summary-section">
        <h4>4. Support Channel Breakdown</h4>
        <p>${escapeHtml(channelList || "No channel data")}</p>
      </div>

      <div class="ai-summary-section">
        <h4>5. Operational Directives</h4>
        <ul>
          <li>Prioritize addressing <strong>${escapeHtml(topMisses[0]?.name || "header cleanliness")}</strong> during team coaching sessions.</li>
          <li>Reinforce standard logging workflows across high-volume requirement checks.</li>
          <li>Note: Sampling count is fixed at 1 pick per active agent and does not reflect individual workload or performance.</li>
        </ul>
      </div>
    </div>
  `;
}

function renderDeltaBadge(delta, type) {
  if (delta === null || delta === undefined) {
    return `<span class="analytics-delta-badge neutral">Baseline</span>`;
  }
  if (delta > 0) {
    return `<span class="analytics-delta-badge positive">+${delta}% ${type}</span>`;
  }
  if (delta < 0) {
    return `<span class="analytics-delta-badge negative">${delta}% ${type}</span>`;
  }
  return `<span class="analytics-delta-badge neutral">0% ${type}</span>`;
}

function renderChannelProgress(channels, total) {
  if (!total) return `<p class="muted">No channel data.</p>`;
  return Object.entries(channels)
    .map(([channel, count]) => {
      const pct = Math.round((count / total) * 100);
      return `
        <div class="channel-bar-row">
          <span class="channel-bar-label">${escapeHtml(channel)}</span>
          <div class="channel-bar-wrap">
            <div class="channel-bar-fill" style="width: ${pct}%"></div>
          </div>
          <span class="channel-bar-count">${count} (${pct}%)</span>
        </div>
      `;
    })
    .join("");
}

function renderDualKpiGrid(analytics) {
  const pop = analytics.population || { totalEligible: 0, cleanCount: 0, missedCount: 0, cleanRate: 0, missRate: 0 };
  const delta = analytics.periodType === "week" ? analytics.wowDelta : analytics.periodType === "month" ? analytics.momDelta : analytics.qoqDelta;
  const deltaType = analytics.periodType === "week" ? "WoW" : analytics.periodType === "month" ? "MoM" : "QoQ";

  const totalAnalyzed = pop.totalEligible || analytics.totalSampled || 0;
  const cleanCount = pop.cleanCount !== undefined ? pop.cleanCount : analytics.cleanCount || 0;
  const cleanRate = pop.totalEligible > 0 ? pop.cleanRate : analytics.cleanRate || 0;
  const missedCount = totalAnalyzed - cleanCount;

  return `
    <div class="analytics-kpi-grid">
      <div class="analytics-kpi-card highlight">
        <span>Team Cleanliness</span>
        <strong>${totalAnalyzed > 0 ? `${cleanRate}%` : "—"}</strong>
        <span class="muted" style="font-size: 11px; margin-top: 4px;">Across all ${totalAnalyzed.toLocaleString()} analyzed tickets</span>
      </div>
      <div class="analytics-kpi-card">
        <span>Total Analyzed Tickets</span>
        <strong>${totalAnalyzed.toLocaleString()}</strong>
        <span class="muted" style="font-size: 11px; margin-top: 4px;">${cleanCount.toLocaleString()} clean &middot; ${missedCount.toLocaleString()} with issues</span>
      </div>
      <div class="analytics-kpi-card">
        <span>Sampled Cleanliness</span>
        <strong style="color: var(--color-primary-dark);">${analytics.totalSampled > 0 ? `${analytics.cleanRate}%` : "—"}</strong>
        <div style="margin-top: 4px;">${renderDeltaBadge(delta, deltaType)}</div>
      </div>
      <div class="analytics-kpi-card">
        <span>Active Agents</span>
        <strong>${analytics.agents?.length || Object.keys(pop.agents || {}).length || 0}</strong>
        <span class="muted" style="font-size: 11px; margin-top: 4px;">Active during this period</span>
      </div>
    </div>
  `;
}

function renderPerformerCards(analytics) {
  const pop = analytics.population;
  const hasPopData = pop && pop.hasData && pop.totalEligible > 0;
  const popAgentsList = hasPopData ? Object.values(pop.agents) : [];
  
  const periodTitle = analytics.periodType === "day" ? "DAY" : analytics.periodType === "week" ? "WEEK" : analytics.periodType === "month" ? "MONTH" : "QUARTER";
  
  const qualifying = popAgentsList.filter((a) => a.total >= 3);
  const candidates = qualifying.length ? qualifying : popAgentsList;
  
  let topPerformer = null;
  let weakPerformer = null;
  
  if (candidates.length) {
    const sortedDesc = [...candidates].sort((a, b) => b.cleanRate - a.cleanRate || b.clean - a.clean || a.total - b.total);
    const sortedAsc = [...candidates].sort((a, b) => a.cleanRate - b.cleanRate || b.missed - a.missed || b.total - a.total);
    
    topPerformer = sortedDesc[0];
    weakPerformer = sortedAsc[0];
    if (topPerformer && weakPerformer && topPerformer.agent === weakPerformer.agent && sortedAsc.length > 1) {
      weakPerformer = sortedAsc[1];
    }
  }

  if (!topPerformer && analytics.agents?.length) {
    const sorted = [...analytics.agents].sort((a, b) => b.cleanRate - a.cleanRate);
    topPerformer = sorted[0];
    weakPerformer = sorted[sorted.length - 1];
  }

  if (!topPerformer && !weakPerformer) {
    return "";
  }

  let topAiSummary = "Maintains strong requirement compliance across daily ticket logging.";
  if (topPerformer) {
    const topCleanRate = topPerformer.cleanRate ?? (topPerformer.total ? Math.round((topPerformer.clean / topPerformer.total) * 100) : 100);
    const topMissRate = topPerformer.missRate ?? (100 - topCleanRate);
    if (topMissRate === 0 || topCleanRate === 100) {
      topAiSummary = `Maintained a perfect 100% compliance record across all ${topPerformer.total || topPerformer.clean || 0} analyzed tickets with zero requirement misses.`;
    } else {
      topAiSummary = `Consistently strong requirement adherence with only a ${topMissRate}% miss rate across ${topPerformer.total} analyzed tickets.`;
    }
  }

  let weakAiSummary = "Shows elevated requirement misses requiring focused SOP coaching.";
  if (weakPerformer) {
    const missesArray = Array.isArray(weakPerformer.misses)
      ? weakPerformer.misses
      : Object.entries(weakPerformer.misses || {}).map(([name, count]) => ({ name, count }));
    const topMiss = missesArray.sort((a, b) => b.count - a.count)[0];
    const weakMissRate = weakPerformer.missRate ?? (weakPerformer.total ? Math.round(((weakPerformer.total - weakPerformer.clean) / weakPerformer.total) * 100) : 0);
    if (topMiss && topMiss.count > 0) {
      weakAiSummary = `Most misses are concentrated around ${topMiss.name}, accounting for ${topMiss.count} of ${weakPerformer.missed || (weakPerformer.total - weakPerformer.clean)} affected tickets.`;
    } else {
      weakAiSummary = `Higher concentration of requirement misses (${weakMissRate}% miss rate) requiring review of standard logging procedures.`;
    }
  }

  return `
    <div class="performer-grid">
      ${topPerformer ? `
        <article class="performer-card top-performer">
          <div class="performer-badge top">Top Performer of ${periodTitle}</div>
          <strong class="performer-name">${escapeHtml(topPerformer.agent)}</strong>
          <p class="performer-desc">Strongest requirement adherence this ${periodTitle.toLowerCase()}.</p>
          <div class="performer-metric">
            <span class="performer-rate">Miss Rate: <strong>${topPerformer.missRate ?? (100 - (topPerformer.cleanRate || 0))}%</strong></span>
            <span class="performer-tickets">${topPerformer.clean || 0}/${topPerformer.total || 0} clean tickets</span>
          </div>
          <div class="performer-ai">
            <strong>AI Summary:</strong> ${escapeHtml(topAiSummary)}
          </div>
        </article>
      ` : ""}
      ${weakPerformer ? `
        <article class="performer-card weak-performer">
          <div class="performer-badge weak">Weak Performer of ${periodTitle}</div>
          <strong class="performer-name">${escapeHtml(weakPerformer.agent)}</strong>
          <p class="performer-desc">Higher concentration of requirement misses this ${periodTitle.toLowerCase()}.</p>
          <div class="performer-metric">
            <span class="performer-rate">Miss Rate: <strong>${weakPerformer.missRate ?? (100 - (weakPerformer.cleanRate || 0))}%</strong></span>
            <span class="performer-tickets">${weakPerformer.missed || (weakPerformer.total - weakPerformer.clean) || 0} affected tickets (${weakPerformer.total || 0} total)</span>
          </div>
          <div class="performer-ai">
            <strong>AI Summary:</strong> ${escapeHtml(weakAiSummary)}
          </div>
        </article>
      ` : ""}
    </div>
  `;
}

function renderAgentRequirementIntelligenceSection(analytics) {
  const pop = analytics.population;
  const agents = analytics.agents || [];
  const populationAgents = pop?.agents || {};

  if (!agents.length && (!populationAgents || !Object.keys(populationAgents).length)) {
    return `
      <div class="analytics-card" style="margin-bottom: 18px;">
        <header>
          <strong>Agent Requirement Intelligence</strong>
          <span>Agents Needing Attention &amp; Requirement Adherence</span>
        </header>
        <p class="muted" style="padding: 16px;">No agent data recorded for this period.</p>
      </div>
    `;
  }

  const sampledMap = Object.fromEntries(agents.map((a) => [a.agent, a]));
  const allAgentNames = [...new Set([...agents.map((a) => a.agent), ...Object.keys(populationAgents || {})])].sort((a, b) => {
    const popA = populationAgents[a] || { missRate: 0, total: 0 };
    const popB = populationAgents[b] || { missRate: 0, total: 0 };
    return popB.missRate - popA.missRate || popB.total - popA.total || a.localeCompare(b);
  });

  return `
    <div class="analytics-card" style="margin-bottom: 18px;">
      <header>
        <strong>Agent Requirement Intelligence</strong>
        <span>Agent Performance &middot; Requirement Misses &middot; High-Impact Tickets</span>
      </header>
      <div class="modal-table-wrap">
        <table>
          <thead>
            <tr>
              <th>Agent Name</th>
              <th>High-Impact Tickets</th>
              <th>Requirement Misses</th>
              <th>Miss Rate</th>
              <th>Requirement Misses Breakdown</th>
            </tr>
          </thead>
          <tbody>
            ${allAgentNames.map((agentName) => {
              const popData = populationAgents[agentName] || { totalAnalyzed: 0, merged: 0, total: 0, clean: 0, missed: 0, missRate: 0, cleanRate: 0, misses: [] };
              const sampData = sampledMap[agentName] || { total: 0, clean: 0, misses: [] };
              const totalAnalyzed = popData.total || sampData.total || 0;
              const cleanCount = popData.clean !== undefined ? popData.clean : sampData.clean || 0;
              const missedCount = popData.missed !== undefined ? popData.missed : (sampData.total - sampData.clean) || 0;
              const missRate = popData.missRate !== undefined ? popData.missRate : (totalAnalyzed ? Math.round((missedCount / totalAnalyzed) * 100) : 0);

              const popMissesList = Array.isArray(popData.misses) && popData.misses.length
                ? popData.misses
                : typeof popData.misses === "object" && Object.keys(popData.misses || {}).length
                ? Object.entries(popData.misses).map(([name, count]) => ({ name, count }))
                : [];

              const highImpactTickets = getAgentHighImpactTickets(analytics, agentName);
              const highImpactCount = highImpactTickets.length;

              const reqMissChips = popMissesList.length
                ? popMissesList.map((m) => `
                    <button type="button" class="req-miss-chip" data-agent-req-popover="${escapeHtml(agentName)}" data-miss-name="${escapeHtml(m.name)}" title="Click to view ticket IDs">
                      ${escapeHtml(m.name)} <span class="chip-count">${m.count} &rsaquo;</span>
                    </button>
                  `).join(" ")
                : `<span class="check yes" style="font-size: 11px;">${totalAnalyzed > 0 ? "100% Clean" : "No Tickets"}</span>`;

              const isExpanded = expandedAgentDrilldown === agentName;
              const agentMissTickets = getAgentMissTickets(analytics, agentName);

              return `
                <tr>
                  <td><strong>${escapeHtml(agentName)}</strong></td>
                  <td>
                    <button type="button" class="high-impact-badge-btn ${highImpactCount > 0 ? "" : "none"}" data-open-high-impact="${escapeHtml(agentName)}" ${highImpactCount === 0 ? "disabled" : ""}>
                      ${highImpactCount} High-Impact
                    </button>
                  </td>
                  <td><span style="color: ${missedCount > 0 ? "var(--color-danger)" : "inherit"}; font-weight: 700;">${missedCount}</span></td>
                  <td><span class="pill ${missRate > 20 ? "shortage" : ""}">${missRate}%</span></td>
                  <td><div class="req-miss-chips-wrap">${reqMissChips}</div></td>
                </tr>
                ${isExpanded ? `
                  <tr class="agent-drilldown-row">
                    <td colspan="5">
                      <div class="drilldown-container">
                        <div class="drilldown-header">
                          <strong>Affected Tickets for ${escapeHtml(agentName)} (${agentMissTickets.length})</strong>
                          <span>Direct Zendesk Links &middot; Click ticket ID to inspect</span>
                        </div>
                        <div class="ticket-chips-grid">
                          ${agentMissTickets.length ? agentMissTickets.map((t) => `
                            <div class="ticket-chip-card">
                              <div class="chip-top">
                                <strong>${renderTicketLink(t.id)}</strong>
                                <span class="chip-channel">${escapeHtml(t.channel || "Chat")}</span>
                              </div>
                              <div class="chip-misses">
                                ${(t.misses || []).map((m) => `<span class="check no" style="font-size: 10px; margin: 1px 2px;">${escapeHtml(m)}</span>`).join("")}
                              </div>
                            </div>
                          `).join("") : `<p class="muted" style="font-size: 12px; margin: 4px 0;">No individual ticket records available for historical compact period.</p>`}
                        </div>
                      </div>
                    </td>
                  </tr>
                ` : ""}
              `;
            }).join("")}
          </tbody>
        </table>
      </div>
    </div>
  `;
}

function renderAgentRequirementIntelligenceTable(agents, populationAgents) {
  return renderAgentRequirementIntelligenceSection({ agents, population: { agents: populationAgents, hasData: true } });
}

function renderAgentAnalyticsTable(agents) {
  return renderAgentRequirementIntelligenceSection({ agents, population: { agents: {}, hasData: false } });
}

function renderSystemicMissesSection(analytics) {
  const pop = analytics.population;
  const effectiveMisses = (pop && pop.hasData && pop.misses?.length) ? pop.misses : (analytics.misses || []);

  if (!effectiveMisses.length) {
    return `
      <div class="analytics-card" style="margin-bottom: 18px;">
        <header>
          <strong>Primary Systemic Misses &amp; SOP Directives</strong>
          <span>Requirement Issues &amp; Coaching Directives</span>
        </header>
        <p class="muted" style="padding: 16px;">No recurring requirement misses recorded for this period.</p>
      </div>
    `;
  }

  const missAdvice = {
    "Default Subject": "Stop leaving ticket subjects as the default Conversation with title; rename them to the actual issue.",
    "Generated Subject": "Stop leaving voice/email subjects as generated call, missed-call, form, or timestamp titles; rename them to Module - issue description.",
    "Header Issue": "Stop using headers that do not follow the Module - issue description format.",
    "Blank Module": "Stop submitting tickets without module/category selection.",
    "Blank Feature": "Stop submitting tickets without the feature/category detail.",
    "Missing Org": "Stop leaving organization blank when the customer account is identifiable.",
    "Email No Hold": "For unresolved emails, stop leaving both resolution time and hold reason blank.",
    "Suspicious Talk Time": "Review calls where talk time is far lower than total call duration.",
    "Low CSAT": "Review low-satisfaction tickets for communication, ownership, and closure quality.",
    "Missing Jira": "Attach JIRA defect/improvement link when escalating software bugs.",
  };

  const missAiInterpretations = {
    "Header Issue": "Most frequent systemic requirement miss this period, primarily driven by non-standard title formatting.",
    "Email No Hold": "Recurring pattern in unresolved emails where hold reasons or resolution times are omitted.",
    "Blank Module": "Tickets submitted without proper module categorization during creation.",
    "Blank Feature": "Tickets submitted without secondary feature detail logging.",
    "Missing Org": "Customer accounts with identifiable organizations left unlinked.",
    "Missing Jira": "Escalated software defect tickets without linked JIRA tracking links.",
    "Default Subject": "Tickets submitted with automated default conversation titles.",
    "Suspicious Talk Time": "Call duration significantly diverges from logged talk time.",
    "Low CSAT": "Negative customer feedback requiring ownership and resolution review.",
    "Generated Subject": "Automated subject lines not updated to actual user issues.",
  };

  return `
    <div class="analytics-card" style="margin-bottom: 18px;">
      <header>
        <strong>Primary Systemic Misses &amp; SOP Directives</strong>
        <span>Requirement Issues &amp; Coaching Directives</span>
      </header>
      <div class="systemic-miss-grid">
        ${effectiveMisses.map((miss) => {
          const isExpanded = expandedSystemicMiss === miss.name;
          const missTickets = getMissTicketsForCategory(analytics, miss.name);
          
          const agentCounts = {};
          for (const t of missTickets) {
            agentCounts[t.agent] = (agentCounts[t.agent] || 0) + 1;
          }
          const contributors = Object.entries(agentCounts).sort((a, b) => b[1] - a[1]);

          const aiText = missAiInterpretations[miss.name] || `Recurring requirement miss accounting for ${miss.count} affected tickets (${miss.rate}% miss rate).`;
          const sopDirective = missAdvice[miss.name] || "Stop this pattern across daily ticket logging.";

          return `
            <article class="systemic-miss-card ${isExpanded ? "expanded" : ""}">
              <div class="systemic-miss-head">
                <div>
                  <h4 class="systemic-miss-title">${escapeHtml(miss.name.toUpperCase())}</h4>
                  <div class="systemic-miss-meta">
                    <span class="systemic-count"><strong>${miss.count}</strong> affected tickets</span>
                    <span class="systemic-rate-pill">${miss.rate}% miss rate</span>
                  </div>
                </div>
                <button type="button" class="ops-action-inline small" data-toggle-systemic-miss="${escapeHtml(miss.name)}">
                  ${isExpanded ? "Hide Contributors" : "View Contributors &rarr;"}
                </button>
              </div>

              <div class="systemic-ai-box">
                <strong>AI Insight:</strong> ${escapeHtml(aiText)}
              </div>

              <div class="systemic-sop-box">
                <strong>Action:</strong> ${escapeHtml(sopDirective)}
              </div>

              ${isExpanded ? `
                <div class="systemic-drilldown-panel">
                  <div class="drilldown-subhead">
                    <strong>Contributing Agents (${contributors.length}) &middot; Click ticket ID to open in Zendesk:</strong>
                  </div>
                  <div class="contributor-rows">
                    ${contributors.length ? contributors.map(([agentName, count]) => {
                      const agentSpecificTickets = missTickets.filter((t) => t.agent === agentName);
                      return `
                        <div class="contributor-row">
                          <div class="contributor-agent-title">
                            <strong>${escapeHtml(agentName)}</strong> &mdash; <span>${count} affected ticket${count === 1 ? "" : "s"}</span>
                          </div>
                          <div class="contributor-ticket-links">
                            ${agentSpecificTickets.map((t) => renderTicketLink(t.id)).join(" ")}
                          </div>
                        </div>
                      `;
                    }).join("") : `<p class="muted" style="font-size: 12px; margin: 4px 0;">No individual ticket records available for historical compact period.</p>`}
                  </div>
                </div>
              ` : ""}
            </article>
          `;
        }).join("")}
      </div>
    </div>
  `;
}

function renderDualMissesTable(populationMisses, sampledMisses) {
  return renderSystemicMissesSection({ misses: sampledMisses, population: { misses: populationMisses, hasData: true } });
}

function renderMissesTable(misses) {
  return renderSystemicMissesSection({ misses, population: { misses: [], hasData: false } });
}

function renderDualChannelMissTable(populationChannels, sampledChannelMisses) {
  return "";
}

function renderChannelMissTable(channelMisses) {
  return "";
}

function renderHistoricalIntelligenceView() {
  const allTickets = Object.values(samplerIntelligence);

  const filtered = allTickets.filter((ticket) => {
    if (intelSearchQuery) {
      const q = intelSearchQuery.toLowerCase();
      const matchId = clean(ticket.id).toLowerCase().includes(q);
      const matchAgent = clean(ticket.agent).toLowerCase().includes(q);
      const matchSubject = clean(ticket.subject).toLowerCase().includes(q);
      const matchModule = clean(ticket.module).toLowerCase().includes(q);
      if (!matchId && !matchAgent && !matchSubject && !matchModule) return false;
    }
    if (intelPeriodFilter !== "all") {
      if (intelPeriodFilter.includes("-Q")) {
        if (computeQaQuarterKey(ticket.date) !== intelPeriodFilter) return false;
      } else if (intelPeriodFilter.includes("-W")) {
        const [yStr, wStr] = intelPeriodFilter.split("-W");
        const tWeek = computeQaWeekNumber(ticket.date);
        let tYear = dateKeyToDate(ticket.date).getFullYear();
        const anchor = getReportingYearAnchorKey(tYear);
        if (ticket.date < anchor) tYear -= 1;
        if (tWeek !== Number(wStr) || tYear !== Number(yStr)) return false;
      } else if (intelPeriodFilter.includes("-")) {
        if (computeQaMonthKey(ticket.date) !== intelPeriodFilter) return false;
      }
    }
    if (intelAuditorFilter !== "all" && clean(ticket.auditor) !== intelAuditorFilter) return false;
    if (intelAgentFilter !== "all" && clean(ticket.agent) !== intelAgentFilter) return false;
    if (intelChannelFilter !== "all" && clean(ticket.channel) !== intelChannelFilter) return false;
    if (intelCleanFilter !== "all") {
      const isClean = getTicketMisses(ticket).length === 0;
      if (intelCleanFilter === "clean" && !isClean) return false;
      if (intelCleanFilter === "missed" && isClean) return false;
    }
    return true;
  }).sort((a, b) => clean(b.date).localeCompare(clean(a.date)) || clean(b.id || b.ticketId).localeCompare(clean(a.id || a.ticketId)));

  const total = allTickets.length;
  const cleanCount = allTickets.filter((t) => getTicketMisses(t).length === 0).length;
  const cleanPct = total ? Math.round((cleanCount / total) * 100) : 0;

  const auditors = [...new Set(allTickets.map((t) => clean(t.auditor)).filter(Boolean))].sort();
  const agents = [...new Set(allTickets.map((t) => clean(t.agent)).filter(Boolean))].sort();
  const quarters = [...new Set(allTickets.map((t) => computeQaQuarterKey(t.date)).filter(Boolean))].sort().reverse();
  const months = [...new Set(allTickets.map((t) => computeQaMonthKey(t.date)).filter(Boolean))].sort().reverse();

  return `
    <div class="intel-filter-bar">
      <input id="intelSearchInput" class="ops-input" type="text" placeholder="Search ticket ID, agent, subject, module..." value="${escapeHtml(intelSearchQuery)}" />
      <select id="intelPeriodSelect" class="ops-input">
        <option value="all">All Periods</option>
        <optgroup label="Quarters">
          ${quarters.map((q) => `<option value="${q}" ${intelPeriodFilter === q ? "selected" : ""}>${getQuarterDetails(q).label}</option>`).join("")}
        </optgroup>
        <optgroup label="Months">
          ${months.map((m) => `<option value="${m}" ${intelPeriodFilter === m ? "selected" : ""}>${formatMonthLabel(m)}</option>`).join("")}
        </optgroup>
      </select>
      <select id="intelAuditorSelect" class="ops-input">
        <option value="all">All Auditors</option>
        ${auditors.map((a) => `<option value="${escapeHtml(a)}" ${intelAuditorFilter === a ? "selected" : ""}>${escapeHtml(a)}</option>`).join("")}
      </select>
      <select id="intelAgentSelect" class="ops-input">
        <option value="all">All Agents</option>
        ${agents.map((a) => `<option value="${escapeHtml(a)}" ${intelAgentFilter === a ? "selected" : ""}>${escapeHtml(a)}</option>`).join("")}
      </select>
      <select id="intelChannelSelect" class="ops-input">
        <option value="all" ${intelChannelFilter === "all" ? "selected" : ""}>All Channels</option>
        <option value="Chat" ${intelChannelFilter === "Chat" ? "selected" : ""}>Chat</option>
        <option value="Voice" ${intelChannelFilter === "Voice" ? "selected" : ""}>Voice</option>
        <option value="Email" ${intelChannelFilter === "Email" ? "selected" : ""}>Email</option>
      </select>
      <select id="intelCleanSelect" class="ops-input">
        <option value="all" ${intelCleanFilter === "all" ? "selected" : ""}>All Results</option>
        <option value="clean" ${intelCleanFilter === "clean" ? "selected" : ""}>Clean Only</option>
        <option value="missed" ${intelCleanFilter === "missed" ? "selected" : ""}>Missed Only</option>
      </select>
      <span class="intel-stats">${filtered.length} of ${total} picks &middot; ${cleanPct}% Clean Overall</span>
    </div>

    <div class="modal-table-wrap" style="max-height: 520px;">
      <table>
        <thead>
          <tr>
            <th>Date</th>
            <th>Ticket ID</th>
            <th>Agent</th>
            <th>Channel</th>
            <th>Module</th>
            <th>Requirement Check</th>
            <th>Auditor</th>
          </tr>
        </thead>
        <tbody>
          ${filtered.length ? filtered.map((ticket) => {
            const misses = getTicketMisses(ticket);
            return `
              <tr>
                <td>${escapeHtml(formatWorksheetDateLabel(ticket.date))}</td>
                <td><strong>${renderTicketLink(ticket.id || ticket.ticketId)}</strong></td>
                <td>${escapeHtml(ticket.agent)}</td>
                <td>${escapeHtml(ticket.channel)}</td>
                <td>${escapeHtml(ticket.module || "-")}</td>
                <td class="checks">
                  ${misses.length ? misses.map((m) => `<span class="check no">${escapeHtml(m)}</span>`).join(" ") : `<span class="check yes">Clean</span>`}
                </td>
                <td><span class="muted">${escapeHtml(ticket.auditor || "Unknown")}</span></td>
              </tr>
            `;
          }).join("") : `<tr><td colspan="7" class="empty">No tickets match the selected filters.</td></tr>`}
        </tbody>
      </table>
    </div>
  `;
}

function openAnalyticsHubModal(initialTab = "weekly") {
  if (initialTab === "weekly" || initialTab === "monthly" || initialTab === "quarterly") {
    activeAnalyticsTab = "performance";
    activePerformancePeriod = initialTab === "weekly" ? "week" : initialTab === "monthly" ? "month" : "quarter";
  } else if (initialTab === "performance" || initialTab === "ai" || initialTab === "intelligence") {
    activeAnalyticsTab = initialTab;
  } else {
    activeAnalyticsTab = "performance";
    activePerformancePeriod = "week";
  }
  const completed = getMostRecentCompletedReportingWeek();
  if (!activeAnalyticsWeek) {
    activeAnalyticsWeek = completed.weekNumber;
    activeAnalyticsYear = completed.year;
  }
  openOpsModal(
    "Sampler Analytics & AI Hub",
    "Comprehensive agent requirement intelligence, systemic SOP directives, and AI management briefings.",
    renderAnalyticsHubPanel(),
    "analytics-modal",
  );
}

function refreshAnalyticsHubPanel() {
  const container = document.querySelector(".ops-panel-body");
  if (container) {
    container.innerHTML = renderAnalyticsHubPanel();
  }
}

function renderAnalyticsHubPanel() {
  return `
    <nav class="analytics-nav ios-nav-segmented">
      <button class="analytics-tab-btn ${activeAnalyticsTab === "performance" ? "active" : ""}" type="button" data-analytics-tab="performance">Performance Analytics</button>
      <button class="analytics-tab-btn ${activeAnalyticsTab === "ai" ? "active" : ""}" type="button" data-analytics-tab="ai">AI Management Summary</button>
      <button class="analytics-tab-btn ${activeAnalyticsTab === "intelligence" ? "active" : ""}" type="button" data-analytics-tab="intelligence">Audited Intelligence</button>
    </nav>
    <div class="analytics-container">
      ${activeAnalyticsTab === "performance" ? renderPerformanceAnalyticsView() : ""}
      ${activeAnalyticsTab === "ai" ? renderAiSummaryTabView() : ""}
      ${activeAnalyticsTab === "intelligence" ? renderHistoricalIntelligenceView() : ""}
    </div>
    ${renderTicketPopoverCard()}
  `;
}

function renderPerformanceAnalyticsView() {
  return `
    <div class="performance-period-segmented-wrap">
      <div class="ios-segmented-control" role="group" aria-label="Performance Period">
        <button class="ios-segment-btn ${activePerformancePeriod === "week" ? "active" : ""}" type="button" data-perf-period="week">Weekly View</button>
        <button class="ios-segment-btn ${activePerformancePeriod === "month" ? "active" : ""}" type="button" data-perf-period="month">Monthly View</button>
        <button class="ios-segment-btn ${activePerformancePeriod === "quarter" ? "active" : ""}" type="button" data-perf-period="quarter">Quarterly View</button>
      </div>
    </div>
    <div class="performance-view-body">
      ${activePerformancePeriod === "week" ? renderWeeklyAnalyticsView() : ""}
      ${activePerformancePeriod === "month" ? renderMonthlyAnalyticsView() : ""}
      ${activePerformancePeriod === "quarter" ? renderQuarterlyAnalyticsView() : ""}
    </div>
  `;
}

function openHistoricalIntelligenceModal() {
  openAnalyticsHubModal("intelligence");
}

function renderWeeklyAnalyticsView() {
  const analytics = buildWeeklyAnalytics(activeAnalyticsYear, activeAnalyticsWeek);

  return `
    <div class="analytics-period-bar">
      <div class="analytics-period-info">
        <strong>${escapeHtml(analytics.label)}</strong>
        <span>Saturday &rarr; Friday Reporting Week</span>
      </div>
      <div class="analytics-period-selector">
        <button class="primary-action" type="button" data-period-action="prev-week" style="min-width: 36px; padding: 6px 12px;">&larr;</button>
        <select id="analyticsWeekSelect" class="ops-input" style="width: auto; min-width: 140px;">
          ${Array.from({ length: 52 }, (_, i) => i + 1).map((w) => `
            <option value="${w}" ${w === activeAnalyticsWeek ? "selected" : ""}>Week ${w}</option>
          `).join("")}
        </select>
        <select id="analyticsYearSelect" class="ops-input" style="width: auto; min-width: 100px;">
          <option value="2026" ${activeAnalyticsYear === 2026 ? "selected" : ""}>2026</option>
          <option value="2027" ${activeAnalyticsYear === 2027 ? "selected" : ""}>2027</option>
        </select>
        <button class="primary-action" type="button" data-period-action="next-week" style="min-width: 36px; padding: 6px 12px;">&rarr;</button>
      </div>
    </div>

    ${renderPerformerCards(analytics)}

    ${renderAgentRequirementIntelligenceSection(analytics)}

    ${renderSystemicMissesSection(analytics)}

    ${renderDualKpiGrid(analytics)}

    <div class="analytics-card" style="margin-bottom: 16px;">
      <header>
        <strong>Support Channel Distribution</strong>
        <span>${analytics.totalSampled} sampled picks</span>
      </header>
      <div class="analytics-card-body">
        ${renderChannelProgress(analytics.channels, analytics.totalSampled)}
      </div>
    </div>
  `;
}

function renderMonthlyAnalyticsView() {
  const analytics = buildMonthlyAnalytics(activeAnalyticsMonth);
  const months = [...new Set(Object.values(samplerIntelligence).map((t) => computeQaMonthKey(t.date)).concat([activeAnalyticsMonth]))].sort().reverse();

  return `
    <div class="analytics-period-bar">
      <div class="analytics-period-info">
        <strong>${escapeHtml(analytics.label)}</strong>
        <span>${escapeHtml(analytics.window)}</span>
      </div>
      <div class="analytics-period-selector">
        <button class="primary-action" type="button" data-period-action="prev-month" style="min-width: 36px; padding: 6px 12px;">&larr;</button>
        <select id="analyticsMonthSelect" class="ops-input" style="width: auto; min-width: 160px;">
          ${months.map((m) => `
            <option value="${m}" ${m === activeAnalyticsMonth ? "selected" : ""}>${formatMonthLabel(m)}</option>
          `).join("")}
        </select>
        <button class="primary-action" type="button" data-period-action="next-month" style="min-width: 36px; padding: 6px 12px;">&rarr;</button>
      </div>
    </div>

    ${renderPerformerCards(analytics)}

    ${renderAgentRequirementIntelligenceSection(analytics)}

    ${renderSystemicMissesSection(analytics)}

    ${renderDualKpiGrid(analytics)}

    <div class="analytics-card" style="margin-bottom: 16px;">
      <header>
        <strong>Monthly Channel Distribution</strong>
        <span>${analytics.totalSampled} sampled picks</span>
      </header>
      <div class="analytics-card-body">
        ${renderChannelProgress(analytics.channels, analytics.totalSampled)}
      </div>
    </div>
  `;
}

function renderQuarterlyAnalyticsView() {
  const analytics = buildQuarterlyAnalytics(activeAnalyticsQuarter);
  const quarters = ["2026-Q1", "2026-Q2", "2026-Q3", "2026-Q4", "2027-Q1"];

  return `
    <div class="analytics-period-bar">
      <div class="analytics-period-info">
        <strong>${escapeHtml(analytics.label)}</strong>
        <span>Quarterly Performance Rollup</span>
      </div>
      <div class="analytics-period-selector">
        <button class="primary-action" type="button" data-period-action="prev-quarter" style="min-width: 36px; padding: 6px 12px;">&larr;</button>
        <select id="analyticsQuarterSelect" class="ops-input" style="width: auto; min-width: 160px;">
          ${quarters.map((q) => `
            <option value="${q}" ${q === activeAnalyticsQuarter ? "selected" : ""}>${getQuarterDetails(q).label}</option>
          `).join("")}
        </select>
        <button class="primary-action" type="button" data-period-action="next-quarter" style="min-width: 36px; padding: 6px 12px;">&rarr;</button>
      </div>
    </div>

    ${renderPerformerCards(analytics)}

    ${renderAgentRequirementIntelligenceSection(analytics)}

    ${renderSystemicMissesSection(analytics)}

    ${renderDualKpiGrid(analytics)}

    <div class="analytics-card" style="margin-bottom: 16px;">
      <header>
        <strong>Weekly Velocity &amp; Quality Trend in Quarter</strong>
        <span>Week-by-Week Breakdown</span>
      </header>
      <div class="modal-table-wrap">
        <table>
          <thead>
            <tr>
              <th>Reporting Week</th>
              <th>Sampled Picks</th>
              <th>Clean Picks</th>
              <th>Clean Rate</th>
            </tr>
          </thead>
          <tbody>
            ${analytics.weeklyTrend.map((w) => `
              <tr>
                <td><strong>Week ${w.weekNumber}</strong></td>
                <td>${w.total}</td>
                <td>${w.cleanCount}</td>
                <td>
                  ${w.cleanRate !== null ? `
                    <span class="pill ${w.cleanRate < 75 ? "shortage" : ""}">
                      ${w.cleanRate}%
                    </span>
                  ` : `<span class="muted">No samples</span>`}
                </td>
              </tr>
            `).join("")}
          </tbody>
        </table>
      </div>
    </div>

    <div class="analytics-card" style="margin-bottom: 16px;">
      <header>
        <strong>Quarterly Channel Distribution</strong>
        <span>${analytics.totalSampled} sampled picks</span>
      </header>
      <div class="analytics-card-body">
        ${renderChannelProgress(analytics.channels, analytics.totalSampled)}
      </div>
    </div>
  `;
}


function handleAiPeriodStep(direction) {
  const step = direction === "prev" ? -1 : 1;
  if (activeAiSummaryPeriodType === "day") {
    const cur = activeAiSummaryDate || todayDateKey();
    const d = dateKeyToDate(cur);
    do {
      d.setDate(d.getDate() + step);
    } while (d.getDay() === 0 || d.getDay() === 6);
    activeAiSummaryDate = dateToKey(d);
  } else if (activeAiSummaryPeriodType === "week") {
    if (direction === "prev") {
      if (activeAnalyticsWeek > 1) {
        activeAnalyticsWeek--;
      } else {
        activeAnalyticsWeek = 52;
        activeAnalyticsYear--;
      }
    } else {
      if (activeAnalyticsWeek < 52) {
        activeAnalyticsWeek++;
      } else {
        activeAnalyticsWeek = 1;
        activeAnalyticsYear++;
      }
    }
  } else if (activeAiSummaryPeriodType === "month") {
    activeAnalyticsMonth = shiftMonthKey(activeAnalyticsMonth, step);
  } else if (activeAiSummaryPeriodType === "quarter") {
    if (direction === "prev") {
      activeAnalyticsQuarter = getPriorQuarterKey(activeAnalyticsQuarter);
    } else {
      const [y, q] = activeAnalyticsQuarter.split("-");
      const numY = Number(y);
      if (q === "Q1") activeAnalyticsQuarter = `${numY}-Q2`;
      else if (q === "Q2") activeAnalyticsQuarter = `${numY}-Q3`;
      else if (q === "Q3") activeAnalyticsQuarter = `${numY}-Q4`;
      else activeAnalyticsQuarter = `${numY + 1}-Q1`;
    }
  }
}

function migrateLegacyStorageIdentities() {
  const nextIntel = {};
  for (const [k, v] of Object.entries(samplerIntelligence)) {
    const channel = v.channel || v.sheet || "Chat";
    const tid = String(v.id || v.ticketId || k);
    const compKey = k.includes("::") ? k : `${channel}::${tid}`;
    nextIntel[compKey] = { ...v, id: tid, ticketId: tid, channel };
  }
  samplerIntelligence = nextIntel;
  safeStorageSetItem(SAMPLER_INTELLIGENCE_KEY, JSON.stringify(samplerIntelligence));

  const nextCopied = new Set();
  for (const key of copiedTickets) {
    if (key.includes("::")) {
      nextCopied.add(key);
    } else {
      const existing = Object.values(samplerIntelligence).find((t) => String(t.id || t.ticketId) === String(key));
      if (existing && existing.channel) {
        nextCopied.add(`${existing.channel}::${key}`);
      }
    }
  }
  copiedTickets = nextCopied;
  safeStorageSetItem("copiedTickets", JSON.stringify([...copiedTickets]));
}

function renderAiSummaryTabView() {
  let analytics;
  let periodLabel = "";

  if (activeAiSummaryPeriodType === "day") {
    analytics = buildDailyAnalytics(activeAiSummaryDate);
    periodLabel = formatWorksheetDateLabel(activeAiSummaryDate);
  } else if (activeAiSummaryPeriodType === "week") {
    analytics = buildWeeklyAnalytics(activeAnalyticsYear, activeAnalyticsWeek);
    periodLabel = analytics.label;
  } else if (activeAiSummaryPeriodType === "month") {
    analytics = buildMonthlyAnalytics(activeAnalyticsMonth);
    periodLabel = formatMonthLabel(activeAnalyticsMonth);
  } else {
    analytics = buildQuarterlyAnalytics(activeAnalyticsQuarter);
    periodLabel = getQuarterDetails(activeAnalyticsQuarter).label;
  }

  return `
    <div class="analytics-period-bar" style="margin-bottom: 18px;">
      <div class="compact-period-nav">
        <select id="aiSummaryPeriodTypeSelect" class="period-type-select">
          <option value="day" ${activeAiSummaryPeriodType === "day" ? "selected" : ""}>Day</option>
          <option value="week" ${activeAiSummaryPeriodType === "week" ? "selected" : ""}>Week</option>
          <option value="month" ${activeAiSummaryPeriodType === "month" ? "selected" : ""}>Month</option>
          <option value="quarter" ${activeAiSummaryPeriodType === "quarter" ? "selected" : ""}>Quarter</option>
        </select>
        <div class="period-stepper">
          <button class="period-stepper-btn" type="button" data-ai-period-action="prev">&larr;</button>
          <span class="period-stepper-label">${escapeHtml(periodLabel)}</span>
          <button class="period-stepper-btn" type="button" data-ai-period-action="next">&rarr;</button>
        </div>
      </div>
    </div>

    <div>
      ${generateAiManagementSummary(analytics)}
    </div>
  `;
}

function renderTicketPopoverCard() {
  if (!activeTicketPopover) return "";
  const { title, subtitle, tickets } = activeTicketPopover;

  return `
    <div class="ticket-popover-overlay" data-close-popover-backdrop>
      <div class="ticket-popover-card" onclick="event.stopPropagation()">
        <div class="ticket-popover-head">
          <div class="ticket-popover-title-wrap">
            <strong>${escapeHtml(title)}</strong>
            <span>${escapeHtml(subtitle)}</span>
          </div>
          <button type="button" class="ticket-popover-close" data-close-popover aria-label="Close">&times;</button>
        </div>
        <div class="ticket-popover-body">
          <div class="ticket-popover-chips">
            ${tickets.length ? tickets.map((t) => `
              <span class="compact-ticket-badge">
                ${renderTicketLink(t.id || t.ticketId)}
              </span>
            `).join("") : `<p class="muted" style="font-size: 12px; margin: 4px 0;">No individual tickets available for this selection.</p>`}
          </div>
        </div>
      </div>
    </div>
  `;
}

function openHighImpactModal(agentName) {
  let analytics;
  if (activePerformancePeriod === "week") analytics = buildWeeklyAnalytics(activeAnalyticsYear, activeAnalyticsWeek);
  else if (activePerformancePeriod === "month") analytics = buildMonthlyAnalytics(activeAnalyticsMonth);
  else analytics = buildQuarterlyAnalytics(activeAnalyticsQuarter);

  const tickets = getAgentHighImpactTickets(analytics, agentName);

  activeTicketPopover = {
    title: `High-Impact Tickets &mdash; ${agentName}`,
    subtitle: `${tickets.length} qualifying tickets (&gt;2 requirement misses or major miss)`,
    tickets: tickets,
  };
  refreshAnalyticsHubPanel();
}

function openAgentReqPopover(agentName, missName) {
  let analytics;
  if (activePerformancePeriod === "week") analytics = buildWeeklyAnalytics(activeAnalyticsYear, activeAnalyticsWeek);
  else if (activePerformancePeriod === "month") analytics = buildMonthlyAnalytics(activeAnalyticsMonth);
  else analytics = buildQuarterlyAnalytics(activeAnalyticsQuarter);

  const allMissTickets = getMissTicketsForCategory(analytics, missName);
  const agentTickets = allMissTickets.filter((t) => t.agent === agentName);

  activeTicketPopover = {
    title: missName,
    subtitle: `${agentTickets.length} affected ticket${agentTickets.length === 1 ? "" : "s"} &middot; ${agentName}`,
    tickets: agentTickets,
  };
  refreshAnalyticsHubPanel();
}

function executeResetCurrentWorkbook() {
  triggerHapticPulse();
  syncDailySessionResetToServer();
  const currentDateKey = normalizeDateKey(currentPayload?.metadata?.samplingDate) || computeDefaultSamplingDate(todayDateKey());

  currentPayload = null;
  allTickets = [];
  viewingHistorical = false;
  activeWorksheetId = null;
  rejectedTickets.clear();
  rejectedPatternCounts = {};

  if (currentDateKey) {
    if (workbookRequirementIntelligence[currentDateKey]) {
      delete workbookRequirementIntelligence[currentDateKey];
      safeStorageSetItem(WORKBOOK_REQUIREMENT_INTELLIGENCE_KEY, JSON.stringify(workbookRequirementIntelligence));
    }
    if (samplerDailyManifests[currentDateKey]) {
      delete samplerDailyManifests[currentDateKey];
      safeStorageSetItem(SAMPLER_DAILY_MANIFEST_KEY, JSON.stringify(samplerDailyManifests));
    }
    for (const [k, pick] of Object.entries(samplerIntelligence)) {
      if (normalizeDateKey(pick.date) === currentDateKey) {
        delete samplerIntelligence[k];
        copiedTickets.delete(k);
        copiedTickets.delete(pick.id || pick.ticketId);
      }
    }
    safeStorageSetItem(SAMPLER_INTELLIGENCE_KEY, JSON.stringify(samplerIntelligence));
    safeStorageSetItem("copiedTickets", JSON.stringify([...copiedTickets]));
  }

  safeStorageSetItem("rejectedTicketsV1", JSON.stringify([]));
  safeStorageSetItem("rejectedPatternCountsV1", JSON.stringify({}));

  closeOpsModal();
  renderTodayCard();
  statusEl.textContent = "Waiting for a daily sampling workbook.";
  controlsEl.hidden = true;
  auditorTabsEl.hidden = true;
  summaryEl.innerHTML = "";
  metricsEl.innerHTML = "";
  resultsEl.innerHTML = "";
}

function executeFlushLocalN1Data() {
  triggerHapticPulse();
  for (const k of Object.keys(workbookRequirementIntelligence)) {
    delete workbookRequirementIntelligence[k];
  }
  for (const k of Object.keys(samplerDailyManifests)) {
    delete samplerDailyManifests[k];
  }
  for (const k of Object.keys(samplerHistoricalSummaries)) {
    delete samplerHistoricalSummaries[k];
  }

  safeStorageSetItem(WORKBOOK_REQUIREMENT_INTELLIGENCE_KEY, JSON.stringify({}));
  safeStorageSetItem(SAMPLER_DAILY_MANIFEST_KEY, JSON.stringify({}));
  safeStorageSetItem(SAMPLER_HISTORICAL_SUMMARIES_KEY, JSON.stringify({}));

  closeOpsModal();
  renderTodayCard();
  if (typeof renderWorksheetLibraryModal === "function") {
    refreshWorksheetLibraryModal();
  }
}

function openResetWorkbookConfirmModal() {
  const currentName = currentPayload?.metadata?.label || currentPayload?.metadata?.filename || "Active Session";
  const currentDate = formatWorksheetDateLabel(normalizeDateKey(currentPayload?.metadata?.samplingDate) || computeDefaultSamplingDate(todayDateKey()));

  openOpsModal(
    "Reset Current Workbook?",
    "Remove current workbook data and locally stored N-1 records.",
    `
      <div style="padding: 6px 0;">
        <p style="margin: 0 0 12px; font-size: 14px; color: var(--text-primary);">
          <strong>Current workbook:</strong> ${escapeHtml(currentName)} (${escapeHtml(currentDate)})
        </p>
        <div style="background: var(--color-surface-secondary); border: 1px solid var(--separator-subtle); border-radius: var(--radius-md); padding: 12px 16px; margin-bottom: 16px;">
          <p style="margin: 0 0 8px; font-size: 13px; font-weight: 600; color: var(--text-primary);">This will remove:</p>
          <ul style="margin: 0; padding-left: 18px; font-size: 12.5px; color: var(--text-secondary); line-height: 1.6;">
            <li>Current workbook session data &amp; in-memory tickets</li>
            <li>Locally stored N-1 requirement intelligence for this date (${escapeHtml(currentDate)})</li>
            <li>Current session sampling state &amp; copied picks for this date</li>
          </ul>
        </div>
        <p class="muted" style="margin: 0 0 16px; font-size: 12.5px;">
          ℹ️ Historical worksheets, agent configurations, and other dates will remain untouched. This action cannot be undone.
        </p>
        <div style="display: flex; justify-content: flex-end; gap: 10px;">
          <button type="button" class="secondary-btn" data-close-ops>Cancel</button>
          <button type="button" class="danger-btn" id="confirmResetWorkbookBtn" data-confirm-reset-workbook>Reset Current Workbook</button>
        </div>
      </div>
    `,
    "reset-confirm-modal"
  );
}

function openFlushN1ConfirmModal() {
  openOpsModal(
    "Flush Local N-1 Data?",
    "Permanently remove locally stored N-1 data from this browser.",
    `
      <div style="padding: 6px 0;">
        <div style="background: var(--color-surface-secondary); border: 1px solid var(--separator-subtle); border-radius: var(--radius-md); padding: 12px 16px; margin-bottom: 16px;">
          <p style="margin: 0 0 8px; font-size: 13px; font-weight: 600; color: var(--color-danger);">Warning:</p>
          <ul style="margin: 0; padding-left: 18px; font-size: 12.5px; color: var(--text-secondary); line-height: 1.6;">
            <li>All locally stored N-1 requirement intelligence will be removed</li>
            <li>All historical daily manifests will be cleared</li>
            <li>Agent assignments and application configuration will be preserved</li>
          </ul>
        </div>
        <p class="muted" style="margin: 0 0 16px; font-size: 12.5px;">
          This will free local storage quota. This action cannot be undone.
        </p>
        <div style="display: flex; justify-content: flex-end; gap: 10px;">
          <button type="button" class="secondary-btn" data-close-ops>Cancel</button>
          <button type="button" class="danger-btn" id="confirmFlushN1Btn" data-confirm-flush-n1>Flush Local N-1 Data</button>
        </div>
      </div>
    `,
    "flush-confirm-modal"
  );
}

function render() {
  if (!currentPayload) return;
  const activeAgents = getActiveAgents();
  const activeTickets = activeAgents.flatMap((agent) => agent.tickets);
  renderSummary(currentPayload.sheets);
  renderMetrics(aggregateMetrics(activeTickets));
  renderResults(activeAgents);
}

const CHANNEL_SUMMARY_HEADINGS = { Chat: "Chat", Voice: "Calls", Email: "Email" };

function renderSummary(sheets) {
  // Per-auditor, so it updates the moment you switch the auditor tab.
  const activeTickets = getActiveAgents().flatMap((agent) => agent.tickets);
  const channels = [];
  for (const sheet of sheets) {
    if (!channels.includes(sheet.channel)) {
      channels.push(sheet.channel);
    }
  }
  summaryEl.innerHTML = channels
    .map((channel) => {
      // Max possible samples for this channel today: deduped tickets for a
      // target agent, minus merged/child tickets (nothing to audit there).
      const available = activeTickets.filter((ticket) => ticket.channel === channel && !ticket.isMergedChild).length;
      const heading = CHANNEL_SUMMARY_HEADINGS[channel] || channel;
      return `
        <article class="metric">
          <strong>${escapeHtml(heading)}</strong>
          <span class="summary-count count-pulse">${available}</span>
        </article>
      `;
    })
    .join("");
}

function renderMetrics(metrics) {
  const items = [
    ["missingJira", "No JIRA", metrics.missingJira],
    ["mergedTickets", "Merged Tickets", metrics.mergedTickets],
    ["blankOrganization", "No Organisation", metrics.blankOrganization],
    ["headerIssues", "Header Issues", metrics.headerIssues],
    ["badCsat", "Bad CSAT", metrics.badCsat],
    ["blankModule", "Blank Side Filters", metrics.blankModule],
  ];

  metricsEl.innerHTML = items
    .map(
      ([key, label, value]) => `
        <button class="mini-metric" type="button" data-metric-key="${key}">
          <strong>${value}</strong>
          <span>${label}</span>
        </button>
      `,
    )
    .join("");
}

function aggregateMetrics(tickets) {
  const metrics = {
    missingJira: 0,
    mergedTickets: 0,
    blankOrganization: 0,
    headerIssues: 0,
    badCsat: 0,
    blankModule: 0,
  };

  for (const ticket of tickets) {
    if (!ticket.isMergedChild && ticket.tags.includes("Missing Jira")) metrics.missingJira += 1;
    if (ticket.isMergedChild) metrics.mergedTickets += 1;
    if (!ticket.isMergedChild && isBlank(ticket.organization)) metrics.blankOrganization += 1;
    if (!ticket.isMergedChild && hasSubjectTag(ticket)) metrics.headerIssues += 1;
    if (!ticket.isMergedChild && hasBadCsatTag(ticket)) metrics.badCsat += 1;
    if (!ticket.isMergedChild && isBlank(ticket.module)) metrics.blankModule += 1;
  }

  return metrics;
}

function hasBadCsatTag(ticket) {
  return (ticket.rawTags || []).some((tag) => fuzzyTagMatches(tag, BAD_CSAT_TAG));
}

function hasSubjectTag(ticket) {
  const tags = ticket.tags || [];
  return tags.some((tag) =>
    ["Header Issue", "Chat Default Subject", "Voice Generated Subject", "Email Generated Subject", "Missing Subject"].includes(tag),
  );
}

function getMetricTickets(metricKey) {
  const tickets = getActiveAgents().flatMap((agent) => agent.tickets);
  const visible = filterTickets(tickets);
  const predicates = {
    missingJira: (ticket) => !ticket.isMergedChild && ticket.tags.includes("Missing Jira"),
    mergedTickets: (ticket) => ticket.isMergedChild,
    blankOrganization: (ticket) => !ticket.isMergedChild && isBlank(ticket.organization),
    headerIssues: (ticket) => !ticket.isMergedChild && hasSubjectTag(ticket),
    badCsat: (ticket) => !ticket.isMergedChild && hasBadCsatTag(ticket),
    blankModule: (ticket) => !ticket.isMergedChild && isBlank(ticket.module),
  };
  return visible.filter(predicates[metricKey] || (() => false));
}

function getMetricLabel(metricKey) {
  const labels = {
    missingJira: "No JIRA",
    mergedTickets: "Merged Tickets",
    blankOrganization: "No Organisation",
    headerIssues: "Header Issues",
    badCsat: "Bad CSAT",
    blankModule: "Blank Side Filters",
  };
  return labels[metricKey] || "Tickets";
}


function renderMetricTicketRows(tickets) {
  if (!tickets.length) {
    return `
      <div class="ios-empty-state">
        <span class="ios-empty-icon">&#128203;</span>
        <strong>No Tickets Found</strong>
        <span>There are no tickets matching this metric under the active filters.</span>
      </div>
    `;
  }

  return tickets.map((ticket) => {
    const channelLower = (ticket.channel || "chat").toLowerCase();
    const searchable = `${ticket.ticketId || ticket.id || ""} ${ticket.agent || ""} ${ticket.channel || ""} ${ticket.subject || ""}`.toLowerCase();
    return `
      <div class="ios-ticket-row" data-ticket-searchable="${escapeHtml(searchable)}">
        <div class="ios-ticket-row-left">
          <div class="ios-ticket-id-wrap">
            ${renderTicketLink(ticket.ticketId || ticket.id)}
          </div>
          <div class="ios-ticket-details">
            <strong class="ios-ticket-agent">${escapeHtml(ticket.agent || "Unknown Agent")}</strong>
            <span class="ios-ticket-meta">
              ${escapeHtml(ticket.date || "-")} &middot; ${escapeHtml(ticket.subject || "No subject specified")}
            </span>
          </div>
        </div>
        <div class="ios-ticket-row-right">
          <span class="ios-channel-badge ${channelLower}">
            ${escapeHtml(ticket.channel || "Chat")}
          </span>
          ${ticket.score !== undefined ? `<span class="ios-score-badge">Score ${ticket.score}</span>` : ""}
        </div>
      </div>
    `;
  }).join("");
}

function openMetricModal(metricKey) {
  const tickets = getMetricTickets(metricKey);
  closeMetricModal();
  closeTagsModal();

  const label = getMetricLabel(metricKey);
  const toneClass = metricKey === "badCsat" || metricKey === "headerIssues" ? "tone-danger" : metricKey === "missingJira" ? "tone-warning" : "tone-primary";

  const modal = document.createElement("div");
  modal.className = "modal-backdrop";
  modal.dataset.metricModal = "true";
  modal.innerHTML = `
    <section class="metric-modal ios-modal-card" role="dialog" aria-modal="true" aria-label="${escapeHtml(label)}">
      <header class="ios-modal-header">
        <div class="ios-modal-title-group">
          <div class="ios-modal-badge ${toneClass}">
            <span class="ios-modal-metric-count">${tickets.length}</span>
          </div>
          <div>
            <strong class="ios-modal-title">${escapeHtml(label)}</strong>
            <span class="ios-modal-subtitle">
              ${tickets.length} ticket${tickets.length === 1 ? "" : "s"} &middot; ${escapeHtml(activeAuditor === "All" ? "All Agents" : activeAuditor)} &middot; ${escapeHtml(currentChannel)}
            </span>
          </div>
        </div>
        <div class="ios-modal-actions">
          ${tickets.length ? `<button type="button" class="ios-pill-btn" data-copy-metric-tickets="${metricKey}">Copy IDs (${tickets.length})</button>` : ""}
          <button type="button" class="ios-close-btn" data-close-modal aria-label="Close">&times;</button>
        </div>
      </header>

      <div class="ios-modal-search-bar">
        <span class="ios-search-icon">&#128269;</span>
        <input type="text" class="ios-search-input" id="metricModalSearchInput" placeholder="Filter by Ticket ID, Agent Name, Channel, or Subject..." />
      </div>

      <div class="ios-modal-content-wrap">
        <div class="ios-ticket-list" id="metricModalTicketList">
          ${renderMetricTicketRows(tickets)}
        </div>
      </div>
    </section>
  `;
  document.body.appendChild(modal);
}

function closeMetricModal() {
  document.querySelector("[data-metric-modal]")?.remove();
}

function openTicketTagsModal(ticketId, channel) {
  const ticket =
    getActiveAgents()
      .flatMap((agent) => agent.tickets)
      .find((item) => clean(item.ticketId) === clean(ticketId) && item.channel === channel) || findTicketById(ticketId);
  closeTagsModal();
  const rawTags = ticket?.rawTags || [];
  const modal = document.createElement("div");
  modal.className = "modal-backdrop";
  modal.dataset.tagsModal = "true";
  modal.innerHTML = `
    <section class="metric-modal" role="dialog" aria-modal="true" aria-label="Ticket ${escapeHtml(ticketId || "")} tags">
      <header>
        <div>
          <strong>Ticket ${escapeHtml(ticketId || "-")} tags</strong>
          <span>${rawTags.length} tag${rawTags.length === 1 ? "" : "s"} from the worksheet</span>
        </div>
        <button type="button" data-close-modal>&times;</button>
      </header>
      <div class="modal-table-wrap">
        ${
          rawTags.length
            ? `<div class="tags">${rawTags.map((tag) => `<span class="tag">${escapeHtml(tag)}</span>`).join("")}</div>`
            : `<div class="empty">No tags recorded for this ticket.</div>`
        }
      </div>
    </section>
  `;
  document.body.appendChild(modal);
}

function closeTagsModal() {
  document.querySelector("[data-tags-modal]")?.remove();
}

// The single choke point every sampling/metrics/ranking view reads
// through - filtering Inactive agents out here is what makes agent status
// apply "immediately" everywhere without touching currentPayload itself.
// Ticket search and history intentionally bypass this (they read
// currentPayload/ticketHistory directly) so inactive agents stay visible
// there, per the historical-accuracy requirement.
function getActiveAgents() {
  if (!activeAuditor || activeAuditor === "All") {
    return (currentPayload?.agents || []).filter((agent) => isAgentActive(agent.agent));
  }
  return (currentPayload?.agents || []).filter((agent) => agent.auditor === activeAuditor && isAgentActive(agent.agent));
}

function renderResults(agents) {
  resultsEl.innerHTML = agents.map(renderAgent).join("");
}

function renderAgent(agent) {
  const { picks: visiblePicks, tickets: visibleTickets } = getDisplayTickets(agent);
  const rows = visiblePicks.length
    ? visiblePicks.map(renderPick).join("")
    : `<tr><td colspan="7" class="empty">No ${currentChannel === "All" ? "" : currentChannel} tickets found for this agent.</td></tr>`;
  const otherTickets = visibleTickets.slice(3);
  const otherRows = otherTickets.map(renderPick).join("");

  return `
    <article class="agent">
      <header class="agent-header">
        <button class="agent-title" type="button" data-agent-summary="${escapeHtml(agent.agent)}">
          ${escapeHtml(agent.agent)}${renderAgentWatchBadge(agent.agent)}
        </button>
        <span class="pill ${agent.status === "Shortage" ? "shortage" : ""}">
          ${agent.status}: ${visibleTickets.length} visible
        </span>
      </header>
      ${expandedAgent === agent.agent ? renderAgentMonthlyPanel(agent.agent) : ""}
      <div class="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Rank</th>
              <th>Date</th>
              <th>Ticket ID</th>
              <th>Agent Name</th>
              <th>Support Channel</th>
              <th>Requirement Check</th>
              <th>Copy Row</th>
            </tr>
          </thead>
          <tbody>${rows}</tbody>
        </table>
      </div>
      <details class="other-tickets">
        <summary>Other tickets for ${escapeHtml(agent.agent)} in priority order (${Math.max(visibleTickets.length - 3, 0)})</summary>
        ${
          otherRows
            ? `
              <div class="table-wrap other-table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>Rank</th>
                      <th>Date</th>
                      <th>Ticket ID</th>
                      <th>Agent Name</th>
                      <th>Support Channel</th>
                      <th>Requirement Check</th>
                      <th>Copy Row</th>
                    </tr>
                  </thead>
                  <tbody>${otherRows}</tbody>
                </table>
              </div>
            `
            : `<div class="empty small">No additional tickets in the current filter.</div>`
        }
      </details>
    </article>
  `;
}

function getDisplayTickets(agent) {
  const visibleTickets = filterTickets(agent.tickets).slice().sort((a, b) => {
    return Number(rejectedTickets.has(String(a.ticketId))) - Number(rejectedTickets.has(String(b.ticketId))) || a.rank - b.rank;
  });
  return {
    tickets: visibleTickets,
    picks: visibleTickets.slice(0, 3),
  };
}

function renderAgentMonthlyPanel(agentName) {
  const summaries = buildMonthlySummary(agentName);
  if (!summaries.length) {
    return `<section class="agent-history"><p>No persistent Sampler Intelligence for this agent yet. Copied picks build the monthly trend.</p></section>`;
  }
  return `
    <section class="agent-history">
      <div class="history-head">
        <strong>Monthly trend for ${escapeHtml(agentName)}</strong>
        <span>${summaries.reduce((sum, month) => sum + month.total, 0)} sampled picks</span>
      </div>
      ${summaries.map(renderMonthSummary).join("")}
    </section>
  `;
}

function renderMonthSummary(month) {
  const channelText = Object.entries(month.channels)
    .map(([channel, count]) => `${channel}: ${count}`)
    .join(" | ");
  const misses = month.misses.length
    ? month.misses.map(renderMissRow).join("")
    : `<tr><td colspan="5" class="empty small">No major cleanliness misses found for this stored month.</td></tr>`;
  const examples = month.tickets
    .filter((ticket) => getTicketMisses(ticket).length > 0)
    .slice(0, 5)
    .map((ticket) => `<span class="history-ticket">${escapeHtml(ticket.date)} | ${renderTicketLink(ticket.id || ticket.ticketId)} | ${escapeHtml(getTicketMisses(ticket).join(", "))}</span>`)
    .join("");
  return `
    <details class="month-summary" open>
      <summary>
        <span>${escapeHtml(month.label)}</span>
        <small>${escapeHtml(month.window)} | ${month.total} tickets | Clean rate ${month.cleanRate}% | ${escapeHtml(channelText)}</small>
      </summary>
      <div class="miss-table-wrap">
        <table class="miss-table">
          <thead>
            <tr>
              <th>Major Miss</th>
              <th>Count</th>
              <th>Rate</th>
              <th>Pattern</th>
              <th>What Should Stop</th>
            </tr>
          </thead>
          <tbody>${misses}</tbody>
        </table>
      </div>
      <div class="history-examples">
        <strong>Example tickets</strong>
        ${examples || `<span class="history-ticket">No miss examples for this month.</span>`}
      </div>
    </details>
  `;
}

function renderMissRow(miss) {
  return `
    <tr>
      <td>${escapeHtml(miss.name)}</td>
      <td>${miss.count}</td>
      <td>${miss.rate}%</td>
      <td><span class="pattern ${miss.severity === "Regular default" ? "major" : ""}">${escapeHtml(miss.severity)}</span></td>
      <td>${escapeHtml(miss.advice)}</td>
    </tr>
  `;
}

function renderPick(pick) {
  const duplicate = hasCopiedTicket(pick.channel, pick.ticketId);
  const rejected = rejectedTickets.has(String(pick.ticketId));
  const copyText = copyRow(pick);

  const copyIcon = `<svg class="app-icon icon-copy" viewBox="0 0 24 24" fill="none"><rect width="13" height="13" x="8" y="8" rx="2" ry="2" stroke="currentColor" stroke-width="1.8"/><path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>`;
  const crossIcon = `<svg class="app-icon icon-crossout" viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="9" stroke="currentColor" stroke-width="1.8"/><path d="m5 5 14 14" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>`;
  const tagIcon = `<svg class="app-icon icon-tag" viewBox="0 0 24 24" fill="none"><path d="m20.59 13.41-7.17 7.17a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82zM7 7h.01" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>`;

  return `
    <tr class="${duplicate ? "duplicate" : ""} ${rejected ? "rejected" : ""} ${pick.isMergedChild ? "merged-child" : ""}">
      <td class="rank">${pick.rank}<span>${escapeHtml(pick.recommendation)}</span></td>
      <td>${escapeHtml(pick.date || "-")}</td>
      <td>
        ${renderTicketLink(pick.ticketId)}
        <button class="tags-btn" type="button" data-tags-ticket="${escapeHtml(pick.ticketId || "")}" data-tags-channel="${escapeHtml(pick.channel || "")}">${tagIcon} <span>Tags</span></button>
        ${duplicate ? `<span class="dupe">Already copied</span>` : ""}
        ${rejected ? `<span class="dupe rejected-label">Crossed out</span>` : ""}
        ${pick.isMergedChild ? `<span class="dupe merged-label">Merged ticket - not auditable</span>` : ""}
      </td>
      <td>${escapeHtml(pick.agent || "-")}</td>
      <td>${escapeHtml(pick.channel || "-")}</td>
      <td class="checks">${renderRequirementChecks(buildRequirementDisplay(pick))}</td>
      <td class="row-actions">
        <button class="copy-btn" data-ticket-id="${escapeHtml(pick.ticketId || "")}" data-channel="${escapeHtml(pick.channel || "")}" data-copy="${escapeHtml(copyText)}">${copyIcon} <span>Copy</span></button>
        <button class="reject-btn" data-ticket-id="${escapeHtml(pick.ticketId || "")}" data-channel="${escapeHtml(pick.channel || "")}" type="button">${crossIcon} <span>${rejected ? "Undo" : "Cross out"}</span></button>
      </td>
    </tr>
  `;
}

// Requirement Check + Tags used to be two columns showing overlapping
// information (e.g. the "Chat >12 min" check and the "Long Chat" tag are the
// same underlying fact). This table merges them into one deduplicated list
// with a plain-language label, so each real issue is only shown once.
//   tone "good"  -> green checkmark (a positive sampling signal, not a defect)
//   tone "bad"   -> red cross (an actual issue/miss the auditor should see)
//   label: null  -> suppressed entirely (not shown at all)
const REQUIREMENT_DISPLAY_RULES = [
  { keys: ["Chat >12 min", "Long Chat"], label: "Chat >12 min", tone: "good" },
  { keys: ["Inbound call", "Inbound Call"], label: "Inbound Call", tone: "good" },
  { keys: ["Call >12 min", "Long Call"], label: "Call >12 min", tone: "good" },
  { keys: ["Call >=10 min", "Usable Call"], label: null },
  {
    keys: ["Talk time mismatch", "Suspicious Talk Time"],
    label: "Suspicious talk time",
    tone: "bad",
    hint: "Call duration and talk time look suspicious - the gap between them is unusually large.",
  },
  { keys: ["Module blank", "Blank Module"], label: "Blank Module", tone: "bad" },
  { keys: ["Feature blank", "Blank Feature"], label: "Blank Feature", tone: "bad" },
  { keys: ["Organization blank", "Missing Org"], label: "Missing Org", tone: "bad" },
  { keys: ["Unsatisfied", "Low CSAT"], label: "Low CSAT", tone: "bad" },
  {
    keys: [
      "Default subject",
      "Generated subject",
      "Header issue",
      "Default Subject",
      "Generated Subject",
      "Header Issue",
      "Chat Default Subject",
      "Voice Generated Subject",
      "Email Generated Subject",
      "Missing Subject",
    ],
    label: "Header Issues",
    tone: "bad",
  },
  { keys: ["Email unresolved/no hold", "Email No Hold"], label: "Email No Hold", tone: "bad" },
  { keys: ["Channel Priority"], label: "Channel Priority", tone: "good" },
  { keys: ["Merged/child ticket", "Merged Ticket"], label: "Merged Ticket", tone: "bad" },
  { keys: ["Jira required"], label: null },
  { keys: ["Missing Jira"], label: "Missing Jira", tone: "bad" },
  { keys: ["Call agent differs", "Voice Transfer"], label: "Voice Transfer", tone: "bad" },
];

function buildRequirementDisplay(ticket) {
  const activeCheckLabels = new Set((ticket.checks || []).filter((check) => check.active).map((check) => check.label));
  const tagLabels = new Set(ticket.tags || []);
  const covered = new Set(REQUIREMENT_DISPLAY_RULES.flatMap((rule) => rule.keys));
  const seen = new Set();
  const items = [];

  for (const rule of REQUIREMENT_DISPLAY_RULES) {
    if (!rule.label) continue;
    if (seen.has(rule.label)) continue;
    const matched = rule.keys.some((key) => activeCheckLabels.has(key) || tagLabels.has(key));
    if (!matched) continue;
    seen.add(rule.label);
    items.push({ label: rule.label, tone: rule.tone, hint: rule.hint });
  }

  // Anything active but not covered above still shows up, defaulting to red -
  // "every error can come in red and cross" rather than silently dropping it.
  for (const label of [...activeCheckLabels, ...tagLabels]) {
    if (covered.has(label) || seen.has(label)) continue;
    seen.add(label);
    items.push({ label, tone: "bad" });
  }

  return items;
}

function renderRequirementChecks(items) {
  if (!items.length) return `<span class="check neutral"><svg class="app-icon icon-check" viewBox="0 0 24 24" fill="none"><path d="M20 6L9 17l-5-5" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/></svg> No flagged issue</span>`;
  return items
    .map((item) => {
      const cls = item.tone === "good" ? "check yes" : "check no";
      const icon = item.tone === "good"
        ? `<svg class="app-icon icon-check" viewBox="0 0 24 24" fill="none"><path d="M20 6L9 17l-5-5" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/></svg>`
        : `<svg class="app-icon icon-fail" viewBox="0 0 24 24" fill="none"><path d="M18 6L6 18M6 6l12 12" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
      const title = item.hint ? ` title="${escapeHtml(item.hint)}"` : "";
      return `<span class="${cls}"${title}>${icon} ${escapeHtml(item.label)}</span>`;
    })
    .join("");
}

function renderChecks(checks) {
  return checks
    .filter((check) => check.active)
    .map((check) => `<span class="check yes"><svg class="app-icon icon-check" viewBox="0 0 24 24" fill="none"><path d="M20 6L9 17l-5-5" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/></svg> ${escapeHtml(check.label)}</span>`)
    .join("") || `<span class="check neutral">No flagged issue</span>`;
}

function renderTags(tags) {
  if (!tags?.length) return `<span class="tag muted-tag">Basic match</span>`;
  return tags.map((tag) => `<span class="tag">${escapeHtml(tag)}</span>`).join("");
}

function renderTicketLink(ticketId) {
  const id = clean(ticketId);
  if (!id) return "-";
  const safeId = encodeURIComponent(id);
  const link = `<a class="ticket-link" href="https://carestack.zendesk.com/agent/tickets/${safeId}" target="_blank" rel="noopener noreferrer">${escapeHtml(id)}</a>`;
  return link + renderWatchIndicator(id);
}

// Small red binoculars next to any ticket link that's on the watchlist -
// gray/dimmed if that watch entry has been marked Resolved. Hovering shows
// the note, date added, and status via the native title tooltip.
function renderWatchIndicator(ticketId) {
  const item = findWatchlistItem(ticketId);
  if (!item) return "";
  const resolved = item.status === "Resolved";
  const title = `${item.note || item.feedback || "Watched ticket"} | Added ${formatDateTime(item.createdAt)} | ${resolved ? "Resolved" : "Active"}`;
  return `<span class="watch-indicator ${resolved ? "watch-indicator-resolved" : "watch-indicator-active"}" title="${escapeHtml(title)}" aria-label="On watchlist: ${escapeHtml(title)}">${WATCH_ICON_SVG}</span>`;
}

const WATCH_ICON_SVG =
  '<svg class="app-icon icon-eye" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7-10-7-10-7Z" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/><circle cx="12" cy="12" r="3" stroke="currentColor" stroke-width="1.8"/></svg>';

function filterTickets(tickets) {
  if (currentChannel === "All") return tickets || [];
  return (tickets || []).filter((ticket) => ticket.channel === currentChannel);
}

function copyRow(pick) {
  const misses = getTicketMisses(pick);
  const observations = misses.length ? misses.join("; ") : "Clean Pick";
  return [
    pick.date || "",
    getWeekOfYearLabel(pick.date),
    getMonthLabel(pick.date),
    pick.ticketId || "",
    pick.agent || "",
    pick.module || "",
    pick.feature || "",
    pick.channel || "",
    observations,
  ].join("\t");
}

function getWeekOfYearLabel(dateText) {
  const dateKey = normalizeDateKey(dateText);
  if (!dateKey) return "";
  return `Week ${computeQaWeekNumber(dateKey)}`;
}

function getMonthLabel(dateText) {
  const date = parseDateText(dateText);
  if (!date) return "";
  return date.toLocaleDateString("en-US", { timeZone: "UTC", month: "long" });
}

async function copyText(text) {
  triggerHapticPulse();
  if (navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(text);
      return;
    } catch {
      // Fall through to the textarea copy path for file:// usage.
    }
  }
  const textarea = document.createElement("textarea");
  textarea.value = text;
  textarea.style.position = "fixed";
  textarea.style.opacity = "0";
  document.body.appendChild(textarea);
  textarea.focus();
  textarea.select();
  document.execCommand("copy");
  textarea.remove();
}

function optionLabel(ticket) {
  const url = ticket.ticketId ? `https://carestack.zendesk.com/agent/tickets/${ticket.ticketId}` : "";
  return `#${ticket.rank} | ${ticket.date || "-"} | ${ticket.ticketId || "-"} | ${ticket.channel} | Score ${ticket.score} | ${ticket.tags?.join(", ") || "Basic match"}${url ? ` | ${url}` : ""}`;
}

function persistCopiedTickets() {
  safeStorageSetItem("copiedTickets", JSON.stringify([...copiedTickets]));
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

// ================= Firestore shared-storage bridge (Phase 3A) =================
// Scope for this phase is deliberately narrow: ONLY the "agent_registry"
// collection, ONLY refresh-based sync (no onSnapshot/realtime), and this is
// the sole place collection names/field names for it are hardcoded - the
// rest of the app never talks to Firestore directly. A small module script
// (loaded before this classic script, see index.html) initializes Firebase
// and exposes a generic doc/collection bridge on window.__fs; everything
// below is defensive about that bridge not existing yet (module scripts are
// deferred, so they can finish AFTER this script starts running) or never
// showing up at all (offline, ad-blocker, no Firebase configured) -
// localStorage remains the fast local cache and the full fallback in every
// one of those cases.
const AGENT_REGISTRY_COLLECTION = "agent_registry";
let fsConnectionState = "connecting"; // "connecting" | "online" | "offline"

function fsBridge() {
  return typeof window !== "undefined" && window.__fs && window.__fs.ready ? window.__fs : null;
}

function setFsConnectionState(state) {
  if (fsConnectionState === state) return;
  fsConnectionState = state;
  renderConnectionIndicator();
}

function renderConnectionIndicator() {
  const el = document.querySelector("#connectionIndicator");
  if (!el) return;
  const labels = {
    connecting: "Connecting to shared audit plan...",
    online: "Synced with shared audit plan",
    offline: "Offline - showing the audit plan cached on this device",
  };
  el.textContent = labels[fsConnectionState] || "";
  el.className = `connection-indicator ${fsConnectionState}`;
}

function currentUpdaterName() {
  return localStorage.getItem("lastUploaderNameV1") || "Unknown";
}

// Fire-and-forget push - called right after the same data is already
// written to localStorage, so a failed/slow Firestore write never blocks
// the UI or loses the local change; it just doesn't reach other auditors
// until they refresh and Firestore is reachable again.
// Fire-and-forget push - called right after the same data is already
// written to localStorage, so a failed/slow Firestore write never blocks
// the UI or loses the local change; it just doesn't reach other auditors
// until they refresh and Firestore is reachable again. extraFieldsByAgent
// optionally supplies per-agent fields (e.g. createdAt when adding a brand
// new agent) merged into that agent's doc alongside the usual ones.
function pushAgentsToFirestore(agentNames, extraFieldsByAgent = {}) {
  const fs = fsBridge();
  if (!fs || !agentNames.length) return;
  const updatedBy = currentUpdaterName();
  const now = new Date().toISOString();
  const entries = agentNames.map((name) => [
    name,
    {
      agentName: name,
      assignedAuditor: agentAssignments[name] || "",
      status: agentStatus[name] === "Inactive" ? "Inactive" : "Active",
      updatedBy,
      updatedAt: now,
      ...(extraFieldsByAgent[name] || {}),
    },
  ]);
  fs.setMany(AGENT_REGISTRY_COLLECTION, entries).catch(() => {});
}

// Applies a Firestore agent_registry snapshot onto local state and
// refreshes every view that depends on it (auditor tabs, dashboard counts,
// Active/Inactive grouping, sampling eligibility) - mirrors what
// commitAgentAssignments()/setAgentStatus() already do for a local UI
// action, just starting from remote data instead.
function applyRemoteAgentRegistry(remoteDocs) {
  if (!remoteDocs) return false;
  const nextAssignments = { ...agentAssignments };
  const nextStatus = { ...agentStatus };
  let changed = false;
  for (const [docId, data] of Object.entries(remoteDocs)) {
    const name = data.agentName || docId;
    if (!name) continue;
    if (data.assignedAuditor && nextAssignments[name] !== data.assignedAuditor) {
      nextAssignments[name] = data.assignedAuditor;
      changed = true;
    }
    const wantInactive = data.status === "Inactive";
    const isInactiveLocally = nextStatus[name] === "Inactive";
    if (wantInactive !== isInactiveLocally) {
      if (wantInactive) nextStatus[name] = "Inactive";
      else delete nextStatus[name];
      changed = true;
    }
  }
  if (!changed) return false;
  agentAssignments = nextAssignments;
  agentStatus = nextStatus;
  saveAgentAssignments();
  saveAgentStatus();
  recomputeAgentAuditorMaps();
  reassignCurrentPayloadAuditors();
  if (!AUDITORS.some((auditor) => auditor.name === activeAuditor)) {
    activeAuditor = AUDITORS[0]?.name || null;
  }
  renderAuditorTabs();
  render(); // recalculates Chat/Call/Email/eligible counts - already auditor-scoped via getActiveAgents()
  if (document.querySelector(".ops-panel-body [data-assign-agent]")) refreshAssignAgentsPanel();
  return true;
}

// The whole "startup flow" from the spec, in order:
//   1. load cached assignments  - already done synchronously above
//      (agentAssignments/agentStatus = load...() at module load time), so
//      the app is usable immediately even before this async step resolves.
//   2. load Firestore           - fs.getCollection (one-time read, NOT
//      onSnapshot - this phase is refresh-based sync only, by design).
//   3. replace the cache        - applyRemoteAgentRegistry()
//   4. refresh the UI           - also inside applyRemoteAgentRegistry()
async function loadAgentRegistryFromFirestore() {
  const fs = fsBridge();
  if (!fs) {
    setFsConnectionState("offline");
    return;
  }
  try {
    const remote = await fs.getCollection(AGENT_REGISTRY_COLLECTION);
    setFsConnectionState("online");
    if (remote && Object.keys(remote).length) {
      applyRemoteAgentRegistry(remote);
    } else if (Object.keys(agentAssignments).length) {
      // Collection is empty but this device already has an assignment map -
      // seed Firestore from it once, so a brand-new project doesn't just
      // sit empty forever waiting for someone to touch every dropdown.
      pushAgentsToFirestore(Object.keys(agentAssignments));
    }
  } catch (error) {
    // Offline, permission error, etc. - error handling requirement: keep
    // the app usable on whatever's already cached locally, never throw.
    setFsConnectionState("offline");
  }
}

if (typeof window !== "undefined") {
  const startupFirestoreSync = async () => {
    // Sequenced per spec: agent registry first (it's what the rest of the
    // UI depends on to even group agents correctly), then history - both
    // best-effort, neither blocks initial render since local cache already
    // rendered synchronously before this ever runs.
    await loadAgentRegistryFromFirestore();
    await loadAssignmentHistoryFromFirestore();
  };
  if (window.__fs?.ready) {
    startupFirestoreSync();
  } else {
    window.addEventListener("firestore-ready", () => startupFirestoreSync(), { once: true });
    // No Firebase config reachable at all (offline, blocked, or not wired
    // up) - fall back to local-only mode rather than showing "Connecting..."
    // forever.
    setTimeout(() => {
      if (!fsBridge()) setFsConnectionState("offline");
    }, 8000);
  }
}

renderTodayCard();
checkRemoteDailySession();

// Periodic remote session poll (every 15s) and on tab focus
if (typeof window !== "undefined") {
  window.addEventListener("focus", () => {
    checkRemoteDailySession();
  });
  setInterval(() => {
    checkRemoteDailySession();
  }, 15000);
}



// ==========================================================================
// MORPHING SEARCH CONTROLLER (Single-Element Liquid Spring Morph)
// ==========================================================================
// FOCUSED QUICK SEARCH (Ticket ID & Agent Name Only)
// ==========================================================================

const morphSearchContainer = document.querySelector("#morphSearchContainer");
const morphSearchBar = document.querySelector("#morphSearchBar");
const morphSearchIconBtn = document.querySelector("#morphSearchIconBtn");
const morphSearchContent = document.querySelector("#morphSearchContent");
const morphSearchInput = document.querySelector("#morphSearchInput");
const morphSearchClearBtn = document.querySelector("#morphSearchClearBtn");
const morphSearchPopover = document.querySelector("#morphSearchPopover");
const morphPopoverResults = document.querySelector("#morphPopoverResults");
const morphPopoverCount = document.querySelector("#morphPopoverCount");

let isMorphSearchOpen = false;

function expandMorphSearch() {
  if (!morphSearchBar || isMorphSearchOpen) return;
  isMorphSearchOpen = true;
  triggerHapticPulse();
  morphSearchBar.classList.add("expanded");
  morphSearchBar.setAttribute("aria-expanded", "true");
  morphSearchContainer?.classList.add("expanded");
  if (morphSearchInput) {
    morphSearchInput.tabIndex = 0;
    setTimeout(() => {
      if (isMorphSearchOpen && morphSearchInput) {
        morphSearchInput.focus();
        if (morphSearchInput.value) {
          runMorphSearch(morphSearchInput.value);
        }
      }
    }, 80);
  }
}

function collapseMorphSearch(clearQuery = true) {
  if (!morphSearchBar) return;
  isMorphSearchOpen = false;
  morphSearchBar.classList.remove("expanded");
  morphSearchBar.setAttribute("aria-expanded", "false");
  morphSearchContainer?.classList.remove("expanded");
  if (morphSearchPopover) morphSearchPopover.hidden = true;
  if (morphSearchInput) {
    morphSearchInput.tabIndex = -1;
    if (clearQuery) {
      morphSearchInput.value = "";
      if (morphSearchClearBtn) morphSearchClearBtn.hidden = true;
    }
    morphSearchInput.blur();
  }
}

function searchTicketIdOrAgent(query) {
  const rawQ = clean(query);
  if (!rawQ) return [];
  const q = rawQ.toLowerCase().trim();
  if (!q) return [];

  const candidates = [];
  const seen = new Set();

  const addTicket = (ticket, agentFallback = "") => {
    if (!ticket) return;
    const tid = String(ticket.ticketId || ticket.id || "").trim();
    if (!tid) return;
    const agent = String(ticket.agent || ticket.name || agentFallback || "").trim();
    const channel = String(ticket.channel || "Chat").trim();
    const compKey = `${channel}::${tid}`;
    if (seen.has(compKey)) return;
    seen.add(compKey);

    const tidLower = tid.toLowerCase();
    const agentLower = agent.toLowerCase();

    // MATCH ONLY: 1. Ticket Number / Ticket ID OR 2. Agent Name
    const matchesId = tidLower.includes(q);
    const matchesAgent = agentLower.includes(q);

    if (matchesId || matchesAgent) {
      let priority = 0;
      if (tidLower === q) priority = 100;
      else if (tidLower.startsWith(q)) priority = 80;
      else if (matchesId) priority = 60;
      else if (agentLower === q) priority = 50;
      else if (agentLower.startsWith(q)) priority = 40;
      else if (matchesAgent) priority = 30;

      candidates.push({
        ticketId: tid,
        agent: agent || "Unknown Agent",
        channel,
        ticket,
        priority,
      });
    }
  };

  // 1. Current live daily workbook tickets
  if (currentPayload?.agents) {
    currentPayload.agents.forEach((agentObj) => {
      const agentName = agentObj.name || agentObj.agent || "";
      (agentObj.tickets || []).forEach((t) => addTicket(t, agentName));
    });
  }

  // 2. Historical & saved sampled tickets
  if (samplerIntelligence) {
    Object.values(samplerIntelligence).forEach((t) => addTicket(t, t.agent || ""));
  }

  candidates.sort((a, b) => b.priority - a.priority);
  return candidates;
}

function runMorphSearch(query) {
  const rawQ = clean(query);
  if (!rawQ || !morphSearchPopover || !morphPopoverResults) {
    if (morphSearchPopover) morphSearchPopover.hidden = true;
    if (morphSearchClearBtn) morphSearchClearBtn.hidden = !rawQ;
    return;
  }

  if (morphSearchClearBtn) morphSearchClearBtn.hidden = false;

  const matches = searchTicketIdOrAgent(rawQ);
  
  if (morphPopoverCount) {
    morphPopoverCount.textContent = `${matches.length} match${matches.length === 1 ? "" : "es"}`;
  }

  if (!matches.length) {
    morphPopoverResults.innerHTML = `
      <div class="morph-empty-state">
        <span>No matching ticket or agent found.</span>
      </div>
    `;
  } else {
    morphPopoverResults.innerHTML = matches.slice(0, 8).map((item) => {
      const tid = item.ticketId;
      const channel = item.channel;
      const agent = item.agent;

      return `
        <div class="morph-result-item" data-morph-open-ticket="${escapeHtml(tid)}" data-morph-channel="${escapeHtml(channel)}">
          <div class="morph-result-main">
            <div class="morph-result-id-row">
              <strong class="morph-result-id">${escapeHtml(tid)}</strong>
              <svg class="app-icon icon-external morph-result-ext" viewBox="0 0 24 24" fill="none"><path d="M15 3h6v6M10 14L21 3M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M17 8l-5-5-5 5M12 3v12" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>
            </div>
            <span class="morph-result-meta">${escapeHtml(agent)} &bull; ${escapeHtml(channel)}</span>
          </div>
        </div>
      `;
    }).join("");
  }

  morphSearchPopover.hidden = false;
}

// Event Listeners for Morphing Search
morphSearchBar?.addEventListener("click", () => {
  if (!isMorphSearchOpen) {
    expandMorphSearch();
  }
});

morphSearchIconBtn?.addEventListener("click", (event) => {
  event.stopPropagation();
  if (!isMorphSearchOpen) {
    expandMorphSearch();
  } else {
    morphSearchInput?.focus();
  }
});

morphSearchClearBtn?.addEventListener("click", (event) => {
  event.stopPropagation();
  collapseMorphSearch(true);
});

morphSearchInput?.addEventListener("input", (event) => {
  runMorphSearch(event.target.value);
});

morphSearchInput?.addEventListener("keydown", (event) => {
  if (event.key === "Escape") {
    collapseMorphSearch(true);
  } else if (event.key === "Enter") {
    const firstResult = morphPopoverResults?.querySelector("[data-morph-open-ticket]");
    if (firstResult) {
      const tid = firstResult.dataset.morphOpenTicket;
      if (tid) {
        window.open(`https://carestack.zendesk.com/agent/tickets/${encodeURIComponent(clean(tid))}`, "_blank", "noopener,noreferrer");
        collapseMorphSearch(true);
      }
    }
  }
});

// Click result to navigate directly to Zendesk and collapse
document.addEventListener("click", (event) => {
  const resultItem = event.target.closest("[data-morph-open-ticket]");
  if (resultItem) {
    const tid = resultItem.dataset.morphOpenTicket;
    if (tid) {
      window.open(`https://carestack.zendesk.com/agent/tickets/${encodeURIComponent(clean(tid))}`, "_blank", "noopener,noreferrer");
      collapseMorphSearch(true);
    }
    return;
  }

  // Outside click collapses morph search (retains query if user typed something)
  if (isMorphSearchOpen && !event.target.closest("#morphSearchContainer")) {
    const hasQuery = Boolean(morphSearchInput?.value?.trim());
    collapseMorphSearch(!hasQuery);
  }
});

// Keyboard shortcut: Cmd+K / Ctrl+K / / triggers morph search
document.addEventListener("keydown", (event) => {
  if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
    event.preventDefault();
    expandMorphSearch();
  } else if (event.key === "/" && !["INPUT", "TEXTAREA", "SELECT"].includes(document.activeElement?.tagName)) {
    event.preventDefault();
    expandMorphSearch();
  }
});

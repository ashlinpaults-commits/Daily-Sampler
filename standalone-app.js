const AUDITORS = [
  {
    name: "Ashlin Paul",
    agents: [
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
    agents: [
      "Akshaya N",
      "Leah Suzanne Punnoose",
      "Muhammed Bazil S",
      "Nitesh Raj",
      "Zon Paul",
      "Akash Anil",
      "Mili Sara Thomas",
    ],
  },
  {
    name: "Manoj M",
    agents: [
      "Aadarsh S",
      "Abhijith Vijay",
      "Anandu Somaraj",
      "Bhadra R",
      "Peter Anil Mathew",
      "Surya Dev S. B.",
      "Swathi Krishna S. A.",
      "Swetha U Krishnan",
      "Vinayak Sadanandan Kumar",
    ],
  },
  {
    name: "Midhun Mohan",
    agents: [
      "Adheena I Sivan",
      "Abinitha E A",
      "Adithya Chandran",
      "Aleena Jose",
      "Angita C Anil",
      "Antony Neval Remalo",
      "Ganga Gopan",
      "Noel Stephen",
      "Presanth B",
      "Subin Suresh",
      "Theertha S Ajay",
      "Tina Jose",
      "Vivek K S",
    ],
  },
];

const TARGET_AGENTS = AUDITORS.flatMap((auditor) => auditor.agents);
const AGENT_LOOKUP = Object.fromEntries(TARGET_AGENTS.map((agent) => [normalizeName(agent), agent]));
const AGENT_ALIASES = {
  [normalizeName("Anandu S")]: "Anandu Somaraj",
  [normalizeName("Abijith Vijay")]: "Abhijith Vijay",
  [normalizeName("Shwetha U Krishnan")]: "Swetha U Krishnan",
  [normalizeName("Swetha Krishnan")]: "Swetha U Krishnan",
};
const AGENT_TO_AUDITOR = Object.fromEntries(
  AUDITORS.flatMap((auditor) => auditor.agents.map((agent) => [agent, auditor.name])),
);
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

let currentPayload = null;
let currentChannel = "All";
let activeAuditor = AUDITORS[0].name;
let expandedAgent = null;
let copiedTickets = new Set(JSON.parse(localStorage.getItem("copiedTickets") || "[]"));
let ticketHistory = loadTicketHistory();
let watchlistItems = loadWatchlist();
let rejectedTickets = new Set(JSON.parse(localStorage.getItem("rejectedTicketsV1") || "[]"));
let rejectedPatternCounts = JSON.parse(localStorage.getItem("rejectedPatternCountsV1") || "{}");

fileInput.addEventListener("change", async () => {
  const file = fileInput.files?.[0];
  if (!file) return;
  await analyzeSelectedFile(file);
});

opsToggleBtn?.addEventListener("click", () => {
  const nextHidden = !opsMenuEl.hidden;
  opsMenuEl.hidden = nextHidden;
  opsToggleBtn.setAttribute("aria-expanded", String(!nextHidden));
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
    currentPayload = await analyzeWorkbook(buffer);
    savePayloadToHistory(currentPayload, file.name);
    currentChannel = "All";
    expandedAgent = null;
    document.querySelectorAll("[data-channel]").forEach((button) => {
      button.classList.toggle("active", button.dataset.channel === "All");
    });
    controlsEl.hidden = false;
    auditorTabsEl.hidden = false;
    activeAuditor = AUDITORS[0].name;
    renderAuditorTabs();
    statusEl.textContent = "Done. This N-1 file is stored locally for monthly agent trends.";
    render();
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
  auditorTabsEl.innerHTML = AUDITORS.map(
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
  renderAuditorTabs();
  render();
});

copyIdealBtn.addEventListener("click", async () => {
  if (!currentPayload) return;
  const rows = getActiveAgents()
    .map((agent) => getDisplayTickets(agent).picks[0])
    .filter(Boolean)
    .map(copyRow);

  if (!rows.length) return;
  await copyText(rows.join("\n"));
  rows.forEach((row) => copiedTickets.add(row.split("\t")[3]));
  persistCopiedTickets();
  copyIdealBtn.textContent = "Copied Ideals";
  setTimeout(() => {
    copyIdealBtn.textContent = "Copy All Ideal Picks";
  }, 1200);
  render();
});

document.addEventListener("click", async (event) => {
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
    return;
  }

  const tagsButton = event.target.closest(".tags-btn");
  if (tagsButton) {
    openTicketTagsModal(tagsButton.dataset.tagsTicket, tagsButton.dataset.tagsChannel);
    return;
  }

  const rejectButton = event.target.closest(".reject-btn");
  if (rejectButton) {
    toggleRejectedTicket(rejectButton.dataset.ticketId);
    render();
    return;
  }

  const button = event.target.closest(".copy-btn");
  if (!button) return;
  await copyText(button.dataset.copy);
  copiedTickets.add(button.dataset.ticketId);
  persistCopiedTickets();
  button.textContent = "Copied";
  setTimeout(() => {
    button.textContent = "Copy";
  }, 1200);
  render();
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
      chatDuration: clean(pick(row, "Chat duration brackets")),
      callDuration: clean(pick(row, "Call duration (min)")),
      callTalkTime: clean(pick(row, "Call talk time (min)")),
      callDirection: clean(pick(row, "Call direction")),
      satisfaction: clean(pick(row, "Ticket satisfaction rating", "Chat satisfaction rating")),
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
  if (lowered.includes("chat")) return "Chat";
  if (lowered.includes("voice") || lowered.includes("call")) return "Voice";
  if (lowered.includes("email")) return "Email";
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

  const isChatDefault = lower.startsWith("conversation with");
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
  const matchedModule = knownModules.find((module) => normalized.toLowerCase().startsWith(module.toLowerCase()));
  const hasHeaderIssue = !matchedModule || !/^[-/]\s*\S.{4,}/.test(normalized.slice(matchedModule.length).trim());
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
  const jiraRequired = JIRA_REQUIRED_TYPES.has(requestType);
  const jiraPresent = rawTags.some((tag) => fuzzyTagMatches(tag, JIRA_TICKET_TAG));
  checks.push(statusTag("Jira required", jiraRequired));
  if (jiraRequired && !jiraPresent) {
    score += 40;
    reasons.push("Incident/Feature Request/Clarification is missing a JIRA escalation tag");
    tags.push("Missing Jira");
  }

  if (channel === "Chat") {
    const duration = clean(pick(row, "Chat duration brackets"));
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

  const unsatisfied = isUnsatisfied(pick(row, "Ticket satisfaction rating", "Chat satisfaction rating"));
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
  if (isUnsatisfied(pick(row, "Ticket satisfaction rating", "Chat satisfaction rating"))) metrics.unsatisfied += 1;
  if (getSubjectIssueDetails(getSubjectValue(row), channel).hasHeaderIssue) metrics.headerIssues += 1;
  if (channel === "Email" && isBlank(pick(row, "resolution_time_hours")) && isBlank(pick(row, "Keep on hold"))) metrics.emailUnresolvedNoHold += 1;
  if (channel === "Chat" && (clean(pick(row, "Chat duration brackets")).includes(">12") || clean(pick(row, "Chat duration brackets")).includes("12+"))) {
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
  localStorage.setItem("rejectedTicketsV1", JSON.stringify([...rejectedTickets]));
  localStorage.setItem("rejectedPatternCountsV1", JSON.stringify(rejectedPatternCounts));
}

function loadTicketHistory() {
  try {
    return JSON.parse(localStorage.getItem("n1TicketHistoryV1") || "{}");
  } catch {
    return {};
  }
}

function saveTicketHistory() {
  localStorage.setItem("n1TicketHistoryV1", JSON.stringify(ticketHistory));
}

function savePayloadToHistory(payload, fileName) {
  const uploadedAt = new Date().toISOString();
  for (const agent of payload.agents) {
    for (const ticket of agent.tickets) {
      if (!ticket.ticketId) continue;
      ticketHistory[ticket.ticketId] = {
        ticketId: ticket.ticketId,
        date: ticket.date,
        monthKey: getMonthKey(ticket.date),
        agent: ticket.agent,
        auditor: ticket.auditor,
        channel: ticket.channel,
        score: ticket.score,
        tags: ticket.tags,
        checks: ticket.checks,
        subject: ticket.subject,
        module: ticket.module,
        feature: ticket.feature,
        organization: ticket.organization,
        satisfaction: ticket.satisfaction,
        solvedHour: ticket.solvedHour,
        keepOnHold: ticket.keepOnHold,
        sourceFile: fileName,
        uploadedAt,
      };
    }
  }
  saveTicketHistory();
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
  localStorage.setItem("ticketWatchlistV1", JSON.stringify(watchlistItems));
}

function handleOpsAction(action) {
  opsMenuEl.hidden = true;
  opsToggleBtn?.setAttribute("aria-expanded", "false");
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
  }
}

function openOpsModal(title, subtitle, bodyHtml) {
  closeOpsModal();
  closeMetricModal();
  const modal = document.createElement("div");
  modal.className = "modal-backdrop";
  modal.dataset.opsModal = "true";
  modal.innerHTML = `
    <section class="metric-modal ops-modal" role="dialog" aria-modal="true" aria-label="${escapeHtml(title)}">
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

function openTicketSearchModal() {
  openOpsModal(
    "Search Ticket",
    "Find old sample notes, stored misses, watchlist feedback, and Zendesk link.",
    `
      <div class="ops-search-row">
        <input id="ticketSearchInput" class="ops-input" type="text" placeholder="Paste ticket ID or Zendesk ticket link" />
        <button class="primary-action" type="button" data-ticket-search-run>Search</button>
      </div>
      <div id="ticketSearchResults" class="ops-results empty">Enter a ticket ID to search your local sampling memory.</div>
    `,
  );
  document.querySelector("#ticketSearchInput")?.focus();
}

function renderTicketSearchResults() {
  const input = document.querySelector("#ticketSearchInput");
  const resultsEl = document.querySelector("#ticketSearchResults");
  if (!input || !resultsEl) return;
  const query = clean(input.value);
  const id = extractTicketId(query);
  const matches = findTicketMemoryMatches(id || query);
  const watchMatches = findWatchlistMatches(id || query);
  if (!matches.length && !watchMatches.length) {
    resultsEl.className = "ops-results empty";
    resultsEl.innerHTML = `No stored sample or watchlist note found for <strong>${escapeHtml(query || "-")}</strong>.`;
    return;
  }
  resultsEl.className = "ops-results";
  resultsEl.innerHTML = `
    ${matches.map(renderTicketMemoryCard).join("")}
    ${watchMatches.length ? renderWatchlistMatches(watchMatches) : ""}
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
  const historyMatches = Object.values(ticketHistory)
    .map((ticket) => ({ ticket, distance: ticketMatchDistance(needle, ticket.ticketId) }))
    .filter((entry) => entry.distance <= Math.max(2, Math.floor(needle.length * 0.18)))
    .sort((a, b) => a.distance - b.distance || clean(b.ticket.uploadedAt).localeCompare(clean(a.ticket.uploadedAt)))
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
            <span>${escapeHtml(item.assignee || "-")} | ${escapeHtml(formatDateTime(item.createdAt))}</span>
          </div>
          <div class="memory-line">${escapeHtml(item.feedback || "-")}</div>
        </article>
      `).join("")}
    </section>
  `;
}

function openWatchlistModal() {
  openOpsModal(
    "Ticket Watchlist",
    "Manually track tickets, assignees, and feedback that should be remembered later.",
    renderWatchlistPanel(),
  );
}

function renderWatchlistPanel() {
  const rows = watchlistItems.length
    ? watchlistItems
        .slice()
        .sort((a, b) => clean(b.createdAt).localeCompare(clean(a.createdAt)))
        .map((item) => `
          <tr>
            <td>${renderTicketLink(item.ticketId)}</td>
            <td>${escapeHtml(item.assignee || "-")}</td>
            <td>${escapeHtml(item.feedback || "-")}</td>
            <td>${escapeHtml(formatDateTime(item.createdAt))}</td>
            <td><button class="reject-btn" type="button" data-watch-delete="${escapeHtml(item.id)}">Remove</button></td>
          </tr>
        `)
        .join("")
    : `<tr><td colspan="5" class="empty">No tickets on the watchlist yet.</td></tr>`;
  return `
    <div class="watch-form">
      <input id="watchTicketInput" class="ops-input" type="text" placeholder="Ticket ID or Zendesk link" />
      <input id="watchAssigneeInput" class="ops-input" type="text" placeholder="Assignee name" />
      <textarea id="watchFeedbackInput" class="ops-textarea" rows="3" placeholder="Feedback or reason to watch"></textarea>
      <button class="primary-action" type="button" data-watch-save>Add to Watchlist</button>
    </div>
    <div class="modal-table-wrap watchlist-table">
      <table>
        <thead>
          <tr>
            <th>Ticket ID</th>
            <th>Assignee</th>
            <th>Feedback</th>
            <th>Added</th>
            <th>Action</th>
          </tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>
    </div>
  `;
}

function saveWatchlistFromModal() {
  const ticketInput = document.querySelector("#watchTicketInput");
  const assigneeInput = document.querySelector("#watchAssigneeInput");
  const feedbackInput = document.querySelector("#watchFeedbackInput");
  const ticketId = extractTicketId(ticketInput?.value || "");
  if (!ticketId) {
    ticketInput?.focus();
    return;
  }
  watchlistItems.unshift({
    id: `${Date.now()}-${Math.random().toString(16).slice(2)}`,
    ticketId,
    assignee: clean(assigneeInput?.value),
    feedback: clean(feedbackInput?.value),
    createdAt: new Date().toISOString(),
  });
  saveWatchlist();
  openWatchlistModal();
}

function deleteWatchlistItem(id) {
  watchlistItems = watchlistItems.filter((item) => item.id !== id);
  saveWatchlist();
  openWatchlistModal();
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
  const match = text.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (!match) return null;
  return new Date(Date.UTC(Number(match[3]), Number(match[1]) - 1, Number(match[2])));
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
  const tickets = Object.values(ticketHistory)
    .filter((ticket) => ticket.agent === agentName)
    .sort((a, b) => clean(a.date).localeCompare(clean(b.date)) || clean(a.ticketId).localeCompare(clean(b.ticketId)));
  const grouped = {};
  for (const ticket of tickets) {
    const key = ticket.monthKey || getMonthKey(ticket.date);
    grouped[key] ||= [];
    grouped[key].push(ticket);
  }
  return Object.entries(grouped)
    .sort(([a], [b]) => b.localeCompare(a))
    .map(([monthKey, monthTickets]) => ({
      monthKey,
      label: formatMonthName(monthKey),
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
  const activeChecks = Object.fromEntries((ticket.checks || []).map((check) => [check.label, check.active]));
  const misses = [];
  if (activeChecks["Default subject"]) misses.push("Default Subject");
  if (activeChecks["Generated subject"]) misses.push("Generated Subject");
  if (activeChecks["Header issue"]) misses.push("Header Issue");
  if (activeChecks["Module blank"]) misses.push("Blank Module");
  if (activeChecks["Feature blank"]) misses.push("Blank Feature");
  if (activeChecks["Organization blank"]) misses.push("Missing Org");
  if (activeChecks["Email unresolved/no hold"]) misses.push("Email No Hold");
  if (activeChecks["Talk time mismatch"]) misses.push("Suspicious Talk Time");
  if (activeChecks["Unsatisfied"]) misses.push("Low CSAT");
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
      advice: missAdvice[name],
    }));
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
  const allTickets = (currentPayload?.agents || []).flatMap((agent) => agent.tickets);
  summaryEl.innerHTML = sheets
    .map((sheet) => {
      // Max possible samples for this channel today: deduped tickets for a
      // target agent, minus merged/child tickets (nothing to audit there).
      const available = allTickets.filter((ticket) => ticket.sheet === sheet.sheet && !ticket.isMergedChild).length;
      const heading = CHANNEL_SUMMARY_HEADINGS[sheet.channel] || sheet.channel;
      return `
        <article class="metric">
          <strong>${escapeHtml(heading)}</strong>
          <span class="summary-count">${available}</span>
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
    if (ticket.tags.includes("Missing Jira")) metrics.missingJira += 1;
    if (ticket.isMergedChild) metrics.mergedTickets += 1;
    if (isBlank(ticket.organization)) metrics.blankOrganization += 1;
    if (hasSubjectTag(ticket)) metrics.headerIssues += 1;
    if (hasBadCsatTag(ticket)) metrics.badCsat += 1;
    if (isBlank(ticket.module)) metrics.blankModule += 1;
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
    missingJira: (ticket) => ticket.tags.includes("Missing Jira"),
    mergedTickets: (ticket) => ticket.isMergedChild,
    blankOrganization: (ticket) => isBlank(ticket.organization),
    headerIssues: (ticket) => hasSubjectTag(ticket),
    badCsat: (ticket) => hasBadCsatTag(ticket),
    blankModule: (ticket) => isBlank(ticket.module),
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

function openMetricModal(metricKey) {
  const tickets = getMetricTickets(metricKey);
  closeMetricModal();
  const modal = document.createElement("div");
  modal.className = "modal-backdrop";
  modal.dataset.metricModal = "true";
  modal.innerHTML = `
    <section class="metric-modal" role="dialog" aria-modal="true" aria-label="${escapeHtml(getMetricLabel(metricKey))}">
      <header>
        <div>
          <strong>${escapeHtml(getMetricLabel(metricKey))}</strong>
          <span>${tickets.length} tickets | ${escapeHtml(activeAuditor)} | ${escapeHtml(currentChannel)}</span>
        </div>
        <button type="button" data-close-modal>&times;</button>
      </header>
      <div class="modal-table-wrap">
        <table>
          <thead>
            <tr>
              <th>Date</th>
              <th>Ticket ID</th>
              <th>Agent Name</th>
              <th>Support Channel</th>
            </tr>
          </thead>
          <tbody>
            ${
              tickets.length
                ? tickets.map((ticket) => `
                  <tr>
                    <td>${escapeHtml(ticket.date || "-")}</td>
                    <td>${renderTicketLink(ticket.ticketId)}</td>
                    <td>${escapeHtml(ticket.agent || "-")}</td>
                    <td>${escapeHtml(ticket.channel || "-")}</td>
                  </tr>
                `).join("")
                : `<tr><td colspan="4" class="empty">No tickets under this metric for the current auditor/filter.</td></tr>`
            }
          </tbody>
        </table>
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

function getActiveAgents() {
  return (currentPayload?.agents || []).filter((agent) => agent.auditor === activeAuditor);
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
        <button class="agent-title" type="button" data-agent-summary="${escapeHtml(agent.agent)}">${escapeHtml(agent.agent)}</button>
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
    return `<section class="agent-history"><p>No stored N-1 history for this agent yet. Upload daily files to build the monthly view.</p></section>`;
  }
  return `
    <section class="agent-history">
      <div class="history-head">
        <strong>Monthly trend for ${escapeHtml(agentName)}</strong>
        <span>${summaries.reduce((sum, month) => sum + month.total, 0)} stored tickets</span>
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
    .map((ticket) => `<span class="history-ticket">${escapeHtml(ticket.date)} | ${renderTicketLink(ticket.ticketId)} | ${escapeHtml(getTicketMisses(ticket).join(", "))}</span>`)
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
  const duplicate = copiedTickets.has(String(pick.ticketId));
  const rejected = rejectedTickets.has(String(pick.ticketId));
  const copyText = copyRow(pick);
  return `
    <tr class="${duplicate ? "duplicate" : ""} ${rejected ? "rejected" : ""} ${pick.isMergedChild ? "merged-child" : ""}">
      <td class="rank">${pick.rank}<span>${escapeHtml(pick.recommendation)}</span></td>
      <td>${escapeHtml(pick.date || "-")}</td>
      <td>
        ${renderTicketLink(pick.ticketId)}
        <button class="tags-btn" type="button" data-tags-ticket="${escapeHtml(pick.ticketId || "")}" data-tags-channel="${escapeHtml(pick.channel || "")}">Tags</button>
        ${duplicate ? `<span class="dupe">Already copied</span>` : ""}
        ${rejected ? `<span class="dupe rejected-label">Crossed out</span>` : ""}
        ${pick.isMergedChild ? `<span class="dupe merged-label">Merged ticket - not auditable</span>` : ""}
      </td>
      <td>${escapeHtml(pick.agent || "-")}</td>
      <td>${escapeHtml(pick.channel || "-")}</td>
      <td class="checks">${renderRequirementChecks(buildRequirementDisplay(pick))}</td>
      <td class="row-actions">
        <button class="copy-btn" data-ticket-id="${escapeHtml(pick.ticketId || "")}" data-copy="${escapeHtml(copyText)}">Copy</button>
        <button class="reject-btn" data-ticket-id="${escapeHtml(pick.ticketId || "")}" type="button">${rejected ? "Undo" : "Cross out"}</button>
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
  if (!items.length) return `<span class="check neutral">No flagged issue</span>`;
  return items
    .map((item) => {
      const cls = item.tone === "good" ? "check yes" : "check no";
      const symbol = item.tone === "good" ? "&#10003;" : "&#10007;";
      const title = item.hint ? ` title="${escapeHtml(item.hint)}"` : "";
      return `<span class="${cls}"${title}>${symbol} ${escapeHtml(item.label)}</span>`;
    })
    .join("");
}

function renderChecks(checks) {
  return checks
    .filter((check) => check.active)
    .map((check) => `<span class="check yes">&#10003; ${escapeHtml(check.label)}</span>`)
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
  return `<a class="ticket-link" href="https://carestack.zendesk.com/agent/tickets/${safeId}" target="_blank" rel="noopener noreferrer">${escapeHtml(id)}</a>`;
}

function filterTickets(tickets) {
  if (currentChannel === "All") return tickets || [];
  return (tickets || []).filter((ticket) => ticket.channel === currentChannel);
}

function copyRow(pick) {
  return [
    pick.date || "",
    getWeekOfYearLabel(pick.date),
    getMonthLabel(pick.date),
    pick.ticketId || "",
    pick.agent || "",
    pick.module || "",
    pick.feature || "",
    pick.channel || "",
  ].join("\t");
}

function getWeekOfYearLabel(dateText) {
  const date = parseDateText(dateText);
  if (!date) return "";
  const tmp = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  const day = tmp.getUTCDay() || 7;
  tmp.setUTCDate(tmp.getUTCDate() + 4 - day);
  const yearStart = new Date(Date.UTC(tmp.getUTCFullYear(), 0, 1));
  const week = Math.ceil(((tmp - yearStart) / 86400000 + 1) / 7);
  return `Week ${week}`;
}

function getMonthLabel(dateText) {
  const date = parseDateText(dateText);
  if (!date) return "";
  return date.toLocaleDateString("en-US", { timeZone: "UTC", month: "long" });
}

async function copyText(text) {
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
  localStorage.setItem("copiedTickets", JSON.stringify([...copiedTickets]));
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

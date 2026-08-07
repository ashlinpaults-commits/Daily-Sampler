const fileInput = document.querySelector("#fileInput");
const statusEl = document.querySelector("#status");
const controlsEl = document.querySelector("#controls");
const copyIdealBtn = document.querySelector("#copyIdeal");
const summaryEl = document.querySelector("#summary");
const metricsEl = document.querySelector("#metrics");
const resultsEl = document.querySelector("#results");

let currentPayload = null;
let currentChannel = "All";
let copiedTickets = new Set(JSON.parse(localStorage.getItem("copiedTickets") || "[]"));

fileInput.addEventListener("change", async () => {
  const file = fileInput.files?.[0];
  if (!file) return;

  statusEl.textContent = `Analyzing ${file.name}...`;
  controlsEl.hidden = true;
  summaryEl.innerHTML = "";
  metricsEl.innerHTML = "";
  resultsEl.innerHTML = "";

  try {
    const response = await fetch("/api/analyze", {
      method: "POST",
      headers: { "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" },
      body: await file.arrayBuffer(),
    });
    const payload = await response.json();
    if (!response.ok) throw new Error(payload.error || "Could not analyze the workbook.");

    currentPayload = payload;
    currentChannel = "All";
    document.querySelectorAll("[data-channel]").forEach((button) => {
      button.classList.toggle("active", button.dataset.channel === "All");
    });
    controlsEl.hidden = false;
    statusEl.textContent = "Done. Ideal picks are ranked first for each agent.";
    render();
  } catch (error) {
    statusEl.textContent = error.message;
  }
});

document.querySelectorAll("[data-channel]").forEach((button) => {
  button.addEventListener("click", () => {
    currentChannel = button.dataset.channel;
    document.querySelectorAll("[data-channel]").forEach((item) => {
      item.classList.toggle("active", item === button);
    });
    render();
  });
});

copyIdealBtn.addEventListener("click", async () => {
  if (!currentPayload) return;
  const rows = currentPayload.agents
    .map((agent) => filterTickets(agent.picks)[0])
    .filter(Boolean)
    .map(copyRow);

  if (!rows.length) return;
  await navigator.clipboard.writeText(rows.join("\n"));
  rows.forEach((row) => copiedTickets.add(row.split("\t")[1]));
  persistCopiedTickets();
  copyIdealBtn.textContent = "Copied Ideals";
  setTimeout(() => {
    copyIdealBtn.textContent = "Copy All Ideal Picks";
  }, 1200);
  render();
});

document.addEventListener("click", async (event) => {
  const button = event.target.closest(".copy-btn");
  if (!button) return;
  await navigator.clipboard.writeText(button.dataset.copy);
  copiedTickets.add(button.dataset.ticketId);
  persistCopiedTickets();
  button.textContent = "Copied";
  setTimeout(() => {
    button.textContent = "Copy";
  }, 1200);
  render();
});

function render() {
  if (!currentPayload) return;
  renderSummary(currentPayload.sheets);
  renderMetrics(currentPayload.metrics);
  renderResults(currentPayload.agents);
}

function renderSummary(sheets) {
  summaryEl.innerHTML = sheets
    .map(
      (sheet) => `
        <article class="metric">
          <strong>${escapeHtml(sheet.sheet)}</strong>
          <span>Channel: ${escapeHtml(sheet.channel)}</span>
          <span>Total rows: ${sheet.rows}</span>
          <span>Rows for target agents: ${sheet.targetAgentRows}</span>
        </article>
      `,
    )
    .join("");
}

function renderMetrics(metrics) {
  const items = [
    ["Target rows", metrics.targetRows],
    ["Long chats", metrics.longChats],
    ["Calls >15 min", metrics.callsOver15],
    ["Blank module", metrics.blankModule],
    ["Blank feature", metrics.blankFeature],
    ["Missing org", metrics.blankOrganization],
    ["Low CSAT", metrics.unsatisfied],
    ["Solved hour blank", metrics.missingSolvedHour],
    ["No hold reason", metrics.missingHoldReasonWhenUnsolved],
  ];

  metricsEl.innerHTML = items
    .map(([label, value]) => `<div class="mini-metric"><strong>${value}</strong><span>${label}</span></div>`)
    .join("");
}

function renderResults(agents) {
  resultsEl.innerHTML = agents.map(renderAgent).join("");
}

function renderAgent(agent) {
  const visiblePicks = filterTickets(agent.picks);
  const visibleTickets = filterTickets(agent.tickets);
  const rows = visiblePicks.length
    ? visiblePicks.map(renderPick).join("")
    : `<tr><td colspan="8" class="empty">No ${currentChannel === "All" ? "" : currentChannel} tickets found for this agent.</td></tr>`;

  const otherTickets = visibleTickets
    .slice(3)
    .map((ticket) => `<option>${escapeHtml(optionLabel(ticket))}</option>`)
    .join("");

  return `
    <article class="agent">
      <header class="agent-header">
        <h2>${escapeHtml(agent.agent)}</h2>
        <span class="pill ${agent.status === "Shortage" ? "shortage" : ""}">
          ${agent.status}: ${visibleTickets.length} visible
        </span>
      </header>
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
              <th>Tags</th>
              <th>Copy Row</th>
            </tr>
          </thead>
          <tbody>${rows}</tbody>
        </table>
      </div>
      <details class="other-tickets">
        <summary>Other tickets for ${escapeHtml(agent.agent)} in priority order (${Math.max(visibleTickets.length - 3, 0)})</summary>
        ${
          otherTickets
            ? `<select size="${Math.min(Math.max(visibleTickets.length - 3, 3), 8)}">${otherTickets}</select>`
            : `<div class="empty small">No additional tickets in the current filter.</div>`
        }
      </details>
    </article>
  `;
}

function renderPick(pick) {
  const duplicate = copiedTickets.has(String(pick.ticketId));
  const copyText = copyRow(pick);
  return `
    <tr class="${duplicate ? "duplicate" : ""}">
      <td class="rank">${pick.rank}<span>${escapeHtml(pick.recommendation)}</span></td>
      <td>${escapeHtml(pick.date || "-")}</td>
      <td>${escapeHtml(pick.ticketId || "-")}${duplicate ? `<span class="dupe">Already copied</span>` : ""}</td>
      <td>${escapeHtml(pick.agent || "-")}</td>
      <td>${escapeHtml(pick.channel || "-")}</td>
      <td class="checks">${renderChecks(pick.checks)}</td>
      <td class="tags">${renderTags(pick.tags)}</td>
      <td><button class="copy-btn" data-ticket-id="${escapeHtml(pick.ticketId || "")}" data-copy="${escapeHtml(copyText)}">Copy</button></td>
    </tr>
  `;
}

function renderChecks(checks) {
  return checks
    .map((check) => `<span class="check ${check.active ? "yes" : "no"}">${check.active ? "✓" : "×"} ${escapeHtml(check.label)}</span>`)
    .join("");
}

function renderTags(tags) {
  if (!tags?.length) return `<span class="tag muted-tag">Basic match</span>`;
  return tags.map((tag) => `<span class="tag">${escapeHtml(tag)}</span>`).join("");
}

function filterTickets(tickets) {
  if (currentChannel === "All") return tickets || [];
  return (tickets || []).filter((ticket) => ticket.channel === currentChannel);
}

function copyRow(pick) {
  return [pick.date || "", pick.ticketId || "", pick.agent || "", pick.channel || ""].join("\t");
}

function optionLabel(ticket) {
  return `#${ticket.rank} | ${ticket.date || "-"} | ${ticket.ticketId || "-"} | ${ticket.channel} | Score ${ticket.score} | ${ticket.tags?.join(", ") || "Basic match"}`;
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

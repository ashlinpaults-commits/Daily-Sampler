import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = __dirname;
const jszip = await readJszip();
const styles = await fs.readFile(`${root}/styles.css`, "utf8");
const app = await fs.readFile(`${root}/standalone-app.js`, "utf8");
const carestackIcon = await fs.readFile(`${root}/assets/carestack-icon.png`, "base64");

async function readJszip() {
  try {
    return await fs.readFile(
      `${root}/node_modules/.pnpm/jszip@3.10.1/node_modules/jszip/dist/jszip.min.js`,
      "utf8",
    );
  } catch (error) {
    if (error?.code !== "ENOENT") throw error;
    const existingHtml = await fs.readFile(`${root}/standalone.html`, "utf8");
    const match = existingHtml.match(/<script>\s*(\/\*!\s*JSZip[\s\S]*?)\s*<\/script>\s*<script>/);
    if (!match) throw new Error("JSZip is missing and could not be recovered from standalone.html.");
    return match[1];
  }
}

const html = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Daily Ticket Sampler &middot; V3.4</title>
    <link rel="icon" type="image/svg+xml" href="data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjAgMCA2NCA2NCIgd2lkdGg9IjY0IiBoZWlnaHQ9IjY0Ij4KICA8ZGVmcz4KICAgIDxsaW5lYXJHcmFkaWVudCBpZD0iYmdHcmFkIiB4MT0iMCUiIHkxPSIwJSIgeDI9IjEwMCUiIHkyPSIxMDAlIj4KICAgICAgPHN0b3Agb2Zmc2V0PSIwJSIgc3RvcC1jb2xvcj0iIzBGNEM1QyIvPgogICAgICA8c3RvcCBvZmZzZXQ9IjEwMCUiIHN0b3AtY29sb3I9IiMzQ0IzNzEiLz4KICAgIDwvbGluZWFyR3JhZGllbnQ+CiAgICA8bGluZWFyR3JhZGllbnQgaWQ9ImJhZGdlR3JhZCIgeDE9IjAlIiB5MT0iMCUiIHgyPSIwJSIgeTI9IjEwMCUiPgogICAgICA8c3RvcCBvZmZzZXQ9IjAlIiBzdG9wLWNvbG9yPSIjRkZGRkZGIi8+CiAgICAgIDxzdG9wIG9mZnNldD0iMTAwJSIgc3RvcC1jb2xvcj0iI0U4RjVFOSIvPgogICAgPC9saW5lYXJHcmFkaWVudD4KICAgIDxmaWx0ZXIgaWQ9InNoYWRvdyIgeD0iLTEwJSIgeT0iLTEwJSIgd2lkdGg9IjEyMCUiIGhlaWdodD0iMTIwJSI+CiAgICAgIDxmZURyb3BTaGFkb3cgZHg9IjAiIGR5PSIyIiBzdGREZXZpYXRpb249IjIiIGZsb29kLWNvbG9yPSIjMDAwMDAwIiBmbG9vZC1vcGFjaXR5PSIwLjI1Ii8+CiAgICA8L2ZpbHRlcj4KICA8L2RlZnM+CiAgPHJlY3Qgd2lkdGg9IjY0IiBoZWlnaHQ9IjY0IiByeD0iMTQiIGZpbGw9InVybCgjYmdHcmFkKSIvPgogIDxyZWN0IHg9IjEiIHk9IjEiIHdpZHRoPSI2MiIgaGVpZ2h0PSI2MiIgcng9IjEzIiBmaWxsPSJub25lIiBzdHJva2U9InJnYmEoMjU1LDI1NSwyNTUsMC4yNSkiIHN0cm9rZS13aWR0aD0iMS41Ii8+CiAgPHBhdGggZD0iTTE2IDE2IEMxNiAxNCAxNy41IDEyLjUgMTkuNSAxMi41IEwzNi41IDEyLjUgTDQ4IDI0IEw0OCA0OCBDNDggNTAgNDYuNSA1MS41IDQ0LjUgNTEuNSBMMTkuNSA1MS41IEMxNy41IDUxLjUgMTYgNTAgMTYgNDggWiIgZmlsbD0idXJsKCNiYWRnZUdyYWQpIiBmaWx0ZXI9InVybCgjc2hhZG93KSIvPgogIDxwYXRoIGQ9Ik0zNi41IDEyLjUgTDM2LjUgMjIgQzM2LjUgMjMgMzcuNSAyNCAzOC41IDI0IEw0OCAyNCBaIiBmaWxsPSIjQzhFNkM5Ii8+CiAgPHJlY3QgeD0iMjIiIHk9IjI0IiB3aWR0aD0iMTEiIGhlaWdodD0iMyIgcng9IjEuNSIgZmlsbD0iIzBGNEM1QyIgb3BhY2l0eT0iMC43NSIvPgogIDxyZWN0IHg9IjIyIiB5PSIzMCIgd2lkdGg9IjE4IiBoZWlnaHQ9IjMiIHJ4PSIxLjUiIGZpbGw9IiMwRjRDNUMiIG9wYWNpdHk9IjAuNSIvPgogIDxyZWN0IHg9IjIyIiB5PSIzNiIgd2lkdGg9IjE0IiBoZWlnaHQ9IjMiIHJ4PSIxLjUiIGZpbGw9IiMwRjRDNUMiIG9wYWNpdHk9IjAuNSIvPgogIDxjaXJjbGUgY3g9IjQxIiBjeT0iNDEiIHI9IjEyIiBmaWxsPSIjM0NCMzcxIiBzdHJva2U9IiNGRkZGRkYiIHN0cm9rZS13aWR0aD0iMi41IiBmaWx0ZXI9InVybCgjc2hhZG93KSIvPgogIDxwYXRoIGQ9Ik0zNiA0MSBMMzkuNSA0NC41IEw0Ni41IDM3LjUiIGZpbGw9Im5vbmUiIHN0cm9rZT0iI0ZGRkZGRiIgc3Ryb2tlLXdpZHRoPSIyLjUiIHN0cm9rZS1saW5lY2FwPSJyb3VuZCIgc3Ryb2tlLWxpbmVqb2luPSJyb3VuZCIvPgo8L3N2Zz4=" />
    <script>
      (function() {
        var theme = localStorage.getItem("sampler-theme") || "dark";
        document.documentElement.setAttribute("data-theme", theme);
      })();
    </script>
    <style>
${styles}
    </style>
  </head>
  <body>
    <script type="module">
      import { initializeApp } from "https://www.gstatic.com/firebasejs/10.13.0/firebase-app.js";
      import {
        getFirestore, doc, setDoc, getDoc, getDocs, collection, onSnapshot, deleteDoc, writeBatch,
        enableIndexedDbPersistence,
      } from "https://www.gstatic.com/firebasejs/10.13.0/firebase-firestore.js";

      const firebaseConfig = {
        apiKey: "AIzaSyBMq_VYAsKUp4uR_9KuvScDA-AUZCsBm34",
        authDomain: "daily-sampler.firebaseapp.com",
        databaseURL: "https://daily-sampler-default-rtdb.firebaseio.com",
        projectId: "daily-sampler",
        storageBucket: "daily-sampler.firebasestorage.app",
        messagingSenderId: "939377250067",
        appId: "1:939377250067:web:e24e91bca8d326d3ba14e6",
        measurementId: "G-TKKWPWBV0T",
      };

      try {
        const app = initializeApp(firebaseConfig);
        const db = getFirestore(app);

        try {
          await enableIndexedDbPersistence(db);
        } catch (err) {
          // Multiple tabs open, or the browser doesn't support it - the app's
          // own localStorage cache still covers offline use.
        }

        window.__fs = {
          ready: true,
          async setDocument(col, id, data, { merge = true } = {}) {
            await setDoc(doc(db, col, id), data, { merge });
          },
          async getDocument(col, id) {
            const snap = await getDoc(doc(db, col, id));
            return snap.exists() ? snap.data() : null;
          },
          async getCollection(col) {
            const snap = await getDocs(collection(db, col));
            const result = {};
            snap.forEach((d) => {
              result[d.id] = d.data();
            });
            return result;
          },
          async deleteDocument(col, id) {
            await deleteDoc(doc(db, col, id));
          },
          async setMany(col, entries, { merge = true } = {}) {
            const batch = writeBatch(db);
            for (const [id, data] of entries) batch.set(doc(db, col, id), data, { merge });
            await batch.commit();
          },
          onCollection(col, cb) {
            return onSnapshot(
              collection(db, col),
              (snap) => {
                const result = {};
                snap.forEach((d) => {
                  result[d.id] = d.data();
                });
                cb(result, null);
              },
              (err) => cb(null, err),
            );
          },
          onDocument(col, id, cb) {
            return onSnapshot(
              doc(db, col, id),
              (snap) => cb(snap.exists() ? snap.data() : null, null),
              (err) => cb(null, err),
            );
          },
        };
        window.dispatchEvent(new Event("firestore-ready"));
      } catch (err) {
        // Firebase failed to initialize (bad config, blocked script, etc.) -
        // window.__fs stays undefined and the app runs fully on localStorage.
      }
    </script>
    <main class="app">
      <section class="toolbar">
        <div class="brand">
          <img class="brand-mark" src="data:image/png;base64,${carestackIcon}" alt="CareStack" />
          <div>
            <h1>Daily Ticket Sampler</h1>
            <p>Upload daily N-1 files, rank picks, and build local monthly agent trends.</p>
            <div class="connection-indicator" id="connectionIndicator"></div>
          </div>
        </div>

        <div class="toolbar-search-section">
          <button type="button" class="icon-btn theme-quick-toggle" id="themeQuickToggle" aria-label="Toggle Light and Dark Mode" title="Toggle Light / Dark Mode">
            <svg class="app-icon icon-theme-sun" viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="5" stroke="currentColor" stroke-width="2"/><path d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>
            <svg class="app-icon icon-theme-moon" viewBox="0 0 24 24" fill="none"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>
          </button>

          <div class="morph-search-container" id="morphSearchContainer">
            <div class="morph-search-bar" id="morphSearchBar" role="search" aria-expanded="false">
              <button type="button" class="morph-search-icon-btn" id="morphSearchIconBtn" aria-label="Search ticket ID or agent" title="Search ticket ID or agent (⌘K / /)">
                <svg class="app-icon icon-search morph-search-icon" viewBox="0 0 24 24" fill="none"><circle cx="11" cy="11" r="7" stroke="currentColor" stroke-width="1.8"/><path d="m20 20-3.5-3.5" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>
              </button>
              <div class="morph-search-content" id="morphSearchContent">
                <input type="text" id="morphSearchInput" class="morph-search-input" placeholder="Search ticket ID or agent..." autocomplete="off" spellcheck="false" tabindex="-1" />
                <button type="button" class="morph-search-clear-btn" id="morphSearchClearBtn" aria-label="Clear search" title="Close search (Esc)">
                  <svg class="app-icon icon-close" viewBox="0 0 24 24" fill="none"><path d="M18 6L6 18M6 6l12 12" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>
                </button>
              </div>
            </div>

            <div class="morph-search-popover" id="morphSearchPopover" hidden>
              <div class="morph-popover-header">
                <span class="morph-popover-tag">MATCHING RESULTS</span>
                <span class="morph-popover-count" id="morphPopoverCount"></span>
              </div>
              <div class="morph-popover-results" id="morphPopoverResults"></div>
            </div>
          </div>
        </div>

        <input id="fileInput" type="file" accept=".xlsx" style="display: none;" />
      </section>

      <section class="today-card" id="todayCard"></section>
      <section id="sessionBanner"></section>

      <section class="status" id="status">
        Waiting for a daily sampling workbook.
      </section>

      <section class="controls" id="controls" hidden>
        <button id="copyIdeal" type="button">Copy All Ideal Picks</button>
        <div class="segmented" aria-label="Filter support channel">
          <button class="active" type="button" data-channel="All">All</button>
          <button type="button" data-channel="Chat">Chat</button>
          <button type="button" data-channel="Voice">Voice</button>
          <button type="button" data-channel="Email">Email</button>
        </div>
      </section>

      <section class="auditor-tabs" id="auditorTabs" hidden></section>

      <section class="summary" id="summary"></section>
      <section class="metrics" id="metrics"></section>
      <section class="results" id="results"></section>
    </main>

    <div class="ops-backdrop" id="opsBackdrop" hidden></div>
    <section class="ops-hub" aria-label="Operations hub">
      <div class="ops-menu" id="opsMenu" hidden aria-hidden="true">
        <div class="ops-menu-header">
          <span class="ops-menu-tag">OPERATIONS &amp; TOOLS</span>
        </div>

        <div class="ops-theme-row" id="opsThemeRow">
          <div class="ops-theme-left">
            <span class="ops-glyph glyph-theme" aria-hidden="true">
              <svg class="theme-glyph-sun" viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="5" stroke="currentColor" stroke-width="2"/><path d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>
              <svg class="theme-glyph-moon" viewBox="0 0 24 24" fill="none"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>
            </span>
            <div class="ops-action-text">
              <strong>Appearance</strong>
              <span id="opsThemeSubtitle">Dark Mode (Teal Glass)</span>
            </div>
          </div>
          <button class="ios-theme-switch" id="themeSwitchBtn" type="button" role="switch" aria-checked="false" aria-label="Toggle Light and Dark Mode">
            <span class="ios-theme-track">
              <span class="ios-theme-thumb"></span>
            </span>
          </button>
        </div>

        <div class="ops-menu-divider"></div>
        
        <div class="ops-menu-group">
          <button class="ops-action analytics" type="button" data-ops-action="analytics">
            <span class="ops-glyph glyph-teal" aria-hidden="true">
              <svg viewBox="0 0 24 24" fill="none"><path d="M18 20V10M12 20V4M6 20v-6" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"/></svg>
            </span>
            <div class="ops-action-text">
              <strong>Analytics &amp; AI</strong>
              <span>Performance &amp; executive brief</span>
            </div>
            <span class="ops-chevron" aria-hidden="true"><svg class="app-icon icon-chevron-right" viewBox="0 0 24 24" fill="none"><path d="m9 18 6-6-6-6" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg></span>
          </button>

          <button class="ops-action audit" type="button" data-ops-action="audit">
            <span class="ops-glyph glyph-emerald" aria-hidden="true">
              <svg viewBox="0 0 24 24" fill="none"><path d="M4 4h16v16H4z" stroke="currentColor" stroke-width="2"/><path d="M4 9h16M9 4v16" stroke="currentColor" stroke-width="2"/></svg>
            </span>
            <div class="ops-action-text">
              <strong>Audit Sheet</strong>
              <span>Daily QA evaluation &amp; scoring</span>
            </div>
            <span class="ops-chevron" aria-hidden="true"><svg class="app-icon icon-chevron-right" viewBox="0 0 24 24" fill="none"><path d="m9 18 6-6-6-6" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg></span>
          </button>

          <button class="ops-action search" type="button" data-ops-action="search">
            <span class="ops-glyph glyph-blue" aria-hidden="true">
              <svg viewBox="0 0 24 24" fill="none"><circle cx="11" cy="11" r="7" stroke="currentColor" stroke-width="2.2"/><path d="m20 20-3.5-3.5" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"/></svg>
            </span>
            <div class="ops-action-text">
              <strong>Search Ticket</strong>
              <span>Inspect ID, agent, or tags</span>
            </div>
            <span class="ops-chevron" aria-hidden="true"><svg class="app-icon icon-chevron-right" viewBox="0 0 24 24" fill="none"><path d="m9 18 6-6-6-6" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg></span>
          </button>
        </div>

        <div class="ops-menu-divider"></div>

        <div class="ops-menu-group">
          <button class="ops-action assign" type="button" data-ops-action="assign">
            <span class="ops-glyph glyph-indigo" aria-hidden="true">
              <svg viewBox="0 0 24 24" fill="none"><circle cx="9" cy="7" r="3" stroke="currentColor" stroke-width="2"/><path d="M3 20c0-3.3 2.7-6 6-6s6 2.7 6 6M16 3.5c1.7.4 3 2 3 3.9s-1.3 3.5-3 3.9M21 20c0-2.8-1.9-5.2-4.5-5.9" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>
            </span>
            <div class="ops-action-text">
              <strong>Agent Management</strong>
              <span>Assignments, aliases, status</span>
            </div>
            <span class="ops-chevron" aria-hidden="true"><svg class="app-icon icon-chevron-right" viewBox="0 0 24 24" fill="none"><path d="m9 18 6-6-6-6" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg></span>
          </button>

          <button class="ops-action firstline" type="button" data-ops-action="firstline" aria-label="Open Firstline">
            <span class="ops-glyph glyph-cyan" aria-hidden="true">
              <svg viewBox="0 0 24 24" fill="none"><path d="M4 12h16M13 5l7 7-7 7" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/></svg>
            </span>
            <div class="ops-action-text">
              <strong>First Line</strong>
              <span>Frontline ticket workflow</span>
            </div>
            <span class="ops-chevron" aria-hidden="true"><svg class="app-icon icon-chevron-right" viewBox="0 0 24 24" fill="none"><path d="m9 18 6-6-6-6" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg></span>
          </button>

          <button class="ops-action watch" type="button" data-ops-action="watchlist">
            <span class="ops-glyph glyph-amber" aria-hidden="true">
              <svg viewBox="0 0 24 24" fill="none"><path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7-10-7-10-7Z" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/><circle cx="12" cy="12" r="3" stroke="currentColor" stroke-width="2"/></svg>
            </span>
            <div class="ops-action-text">
              <strong>Watchlist</strong>
              <span>High-attention agent tracker</span>
            </div>
            <span class="ops-chevron" aria-hidden="true"><svg class="app-icon icon-chevron-right" viewBox="0 0 24 24" fill="none"><path d="m9 18 6-6-6-6" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg></span>
          </button>
        </div>
      </div>

      <button class="ops-toggle" id="opsToggle" type="button" aria-expanded="false" aria-controls="opsMenu" aria-label="Operations hub">
        <div class="ops-toggle-inner">
          <svg class="ops-toggle-icon icon-menu" viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <path d="M4 7h16M4 12h16M4 17h16" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"/>
          </svg>
          <svg class="ops-toggle-icon icon-close" viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <path d="M18 6L6 18M6 6l12 12" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"/>
          </svg>
        </div>
      </button>
    </section>

    <script>
${jszip}
    </script>
    <script>
${app}
    </script>
  </body>
</html>
`;

await fs.writeFile(`${root}/standalone.html`, html, "utf8");
await fs.writeFile(`${root}/index.html`, html, "utf8");
console.log(`Successfully built standalone.html and index.html at ${root}`);

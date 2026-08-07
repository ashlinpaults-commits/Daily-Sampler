import fs from "node:fs/promises";

const root = "C:/Users/ashlinpaul/Documents/Sampler";
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
    <title>Daily Ticket Sampler</title>
    <style>
${styles}
    </style>
  </head>
  <body>
    <main class="app">
      <section class="toolbar">
        <div class="brand">
          <img class="brand-mark" src="data:image/png;base64,${carestackIcon}" alt="CareStack" />
          <div>
            <h1>Daily Ticket Sampler</h1>
            <p>Upload daily N-1 files, rank picks, and build local monthly agent trends.</p>
          </div>
        </div>
        <div class="upload-actions">
          <label class="upload">
            <input id="fileInput" type="file" accept=".xlsx" />
            <span>Choose Excel File</span>
          </label>
        </div>
      </section>

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

    <section class="ops-hub" aria-label="Operations hub">
      <div class="ops-menu" id="opsMenu" hidden>
        <button class="ops-action search" type="button" data-ops-action="search">
          <span class="ops-glyph">S</span>
          <strong>Search ticket</strong>
        </button>
        <button class="ops-action audit" type="button" data-ops-action="audit">
          <span class="ops-glyph">A</span>
          <strong>Audit sheets</strong>
        </button>
        <button class="ops-action firstline" type="button" data-ops-action="firstline" aria-label="Open Firstline">
          <span class="ops-glyph">F</span>
          <strong>Firstline</strong>
        </button>
        <button class="ops-action watch" type="button" data-ops-action="watchlist">
          <span class="ops-glyph">W</span>
          <strong>Watchlist</strong>
        </button>
        <button class="ops-action sop" type="button" data-ops-action="sop">
          <span class="ops-glyph">P</span>
          <strong>SOP guide</strong>
        </button>
      </div>
      <button class="ops-toggle" id="opsToggle" type="button" aria-expanded="false" aria-controls="opsMenu">
        <img src="data:image/png;base64,${carestackIcon}" alt="" />
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
console.log(`${root}/standalone.html`);

import fs from "node:fs/promises";
import path from "node:path";
import { FileBlob, SpreadsheetFile } from "@oai/artifact-tool";

const inputPath = "C:/Users/ashlinpaul/Downloads/Docs/N-1SamplingData_71126_514.xlsx";
const outputDir = "C:/Users/ashlinpaul/Documents/Sampler/template-work";
await fs.mkdir(outputDir, { recursive: true });

const input = await FileBlob.load(inputPath);
const workbook = await SpreadsheetFile.importXlsx(input);

const summary = await workbook.inspect({
  kind: "workbook,sheet,table,region",
  maxChars: 12000,
  tableMaxRows: 8,
  tableMaxCols: 12,
  tableMaxCellChars: 120,
});

await fs.writeFile(path.join(outputDir, "sampling-inspect.ndjson"), summary.ndjson, "utf8");

const sheetInfo = await workbook.inspect({
  kind: "sheet",
  include: "id,name",
  maxChars: 3000,
});
await fs.writeFile(path.join(outputDir, "sheets.ndjson"), sheetInfo.ndjson, "utf8");

const sheetLines = sheetInfo.ndjson
  .split(/\r?\n/)
  .filter(Boolean)
  .map((line) => JSON.parse(line));
const firstSheet = sheetLines.find((record) => record.name)?.name;

if (!firstSheet) {
  throw new Error("No visible sheet found in workbook.");
}

try {
  await fs.writeFile(path.join(outputDir, "render-started.txt"), `${firstSheet}\n`, "utf8");
  const preview = await workbook.render({
    sheetName: firstSheet,
    range: "A1:N24",
    scale: 1,
    format: "png",
  });
  await fs.writeFile(
    path.join(outputDir, "preview.png"),
    new Uint8Array(await preview.arrayBuffer()),
  );
} catch (error) {
  await fs.writeFile(
    path.join(outputDir, "render-error.txt"),
    `${error?.stack ?? error?.message ?? String(error)}\n`,
    "utf8",
  );
  throw error;
}

console.log(JSON.stringify({ firstSheet, outputDir }, null, 2));

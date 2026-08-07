import { chromium } from "playwright";

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage();
await page.goto("file:///C:/Users/ashlinpaul/Documents/Sampler/standalone.html");
await page.setInputFiles("#fileInput", "C:/Users/ashlinpaul/Downloads/Docs/N-1SamplingData_71126_514.xlsx");
await page.waitForSelector(".agent", { timeout: 10000 });
const status = await page.locator("#status").textContent();
const agentCount = await page.locator(".agent").count();
const firstDate = await page.locator(".agent tbody tr").first().locator("td").nth(1).textContent();
const metrics = await page.locator(".mini-metric").count();
console.log(JSON.stringify({ status, agentCount, firstDate, metrics }, null, 2));
await browser.close();

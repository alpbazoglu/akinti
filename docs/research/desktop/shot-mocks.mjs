// Isolated Playwright screenshot script for the two AKINTI desktop mockups.
// Own chromium.launch(), not the shared MCP browser (repo rule).
import { chromium } from "playwright";
import path from "node:path";
import { pathToFileURL } from "node:url";

const DIR = path.resolve("docs/research/desktop");
const browser = await chromium.launch({ headless: true });

for (const name of ["mock-A", "mock-B"]) {
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await context.newPage();
  const fileUrl = pathToFileURL(path.join(DIR, `${name}.html`)).href;
  await page.goto(fileUrl, { waitUntil: "networkidle", timeout: 20000 });
  await page.waitForTimeout(600);
  await page.screenshot({ path: path.join(DIR, `${name}.png`) });
  console.log(`OK ${name}.png`);
  await context.close();
}

await browser.close();

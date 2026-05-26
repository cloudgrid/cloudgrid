import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "../../node_modules/.bun/playwright@1.60.0/node_modules/playwright/index.mjs";

const root = dirname(fileURLToPath(import.meta.url));
const outDir = join(root, "screenshots");
const baseUrl = process.env.CLOUDGRID_MOCKUP_URL ?? "http://127.0.0.1:4177";

const screens = [
  "trace-overview",
  "trace-detail",
  "logs",
  "metrics",
  "dashboards",
  "dataset-overview",
  "dataset-detail",
  "evaluations",
  "evaluation-detail",
];

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({
  viewport: { width: 1920, height: 1080 },
  deviceScaleFactor: 1,
});

for (const screen of screens) {
  await page.goto(`${baseUrl}/#${screen}`, { waitUntil: "load" });
  await page.waitForTimeout(200);
  await page.screenshot({
    path: join(outDir, `${screen}.png`),
    fullPage: false,
  });
}

await browser.close();
console.log(`Captured ${screens.length} screenshots in ${outDir}`);

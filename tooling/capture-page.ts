import { chromium } from "playwright";

const page_path = process.argv[2] ?? "index.html";
const output = process.argv[3] ?? "screenshot.png";

async function capture() {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  page.on("console", (msg) => console.log("BROWSER:", msg.text()));
  page.on("pageerror", (err) => console.log("ERROR:", err.message));
  await page.goto(`http://localhost:4000/${page_path}`, { waitUntil: "networkidle" });
  await page.waitForTimeout(3000);
  await page.screenshot({ path: output });
  await browser.close();
  console.log(`Screenshot: ${output}`);
}

capture();

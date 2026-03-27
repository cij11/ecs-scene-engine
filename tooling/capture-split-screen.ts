import { chromium } from "playwright";

async function capture() {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  page.on("console", (msg) => console.log("BROWSER:", msg.text()));
  page.on("pageerror", (err) => console.log("ERROR:", err.message));
  const url = "http://localhost:4000/split-screen.html";
  console.log("Navigating to:", url);
  const response = await page.goto(url, { waitUntil: "networkidle" });
  console.log("Page status:", response?.status(), "title:", await page.title());
  await page.waitForTimeout(3000);
  await page.screenshot({
    path: "process/agile/sprints/sprint_9_2026_03_27/demo/split-screen-screenshot.png",
  });
  await browser.close();
  console.log("Screenshot captured: split-screen-screenshot.png");
}

capture();

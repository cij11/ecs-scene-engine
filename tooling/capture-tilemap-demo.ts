import { chromium } from "playwright";

async function capture() {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  const storyDir = "stories/feat-ese-0021/feat-ese-0021-06/demo";
  await page.goto("http://localhost:4000/tilemap-demo.html", { waitUntil: "networkidle" });
  await page.waitForTimeout(1000);

  // Screenshot 1: initial state with debug overlays
  await page.screenshot({ path: `${storyDir}/tilemap-01-initial.png` });
  console.log("1. Initial state captured");

  // Paint some different tiles: press 2 (triangle BL), click a few spots
  await page.keyboard.press("2");
  await page.waitForTimeout(200);
  await page.mouse.click(640, 400); // centre-ish
  await page.waitForTimeout(200);
  await page.mouse.click(700, 400);
  await page.waitForTimeout(200);
  await page.keyboard.press("3"); // triangle BR
  await page.mouse.click(640, 350);
  await page.waitForTimeout(200);

  // Screenshot 2: after painting
  await page.screenshot({ path: `${storyDir}/tilemap-02-painted.png` });
  console.log("2. After painting captured");

  // Carve mode: press C, click to carve
  await page.keyboard.press("c");
  await page.waitForTimeout(200);
  await page.mouse.click(500, 450);
  await page.waitForTimeout(200);
  await page.mouse.click(700, 350);
  await page.waitForTimeout(200);

  // Screenshot 3: after carving
  await page.screenshot({ path: `${storyDir}/tilemap-03-carved.png` });
  console.log("3. After carving captured");

  await browser.close();
  console.log("All screenshots captured");
}

capture();

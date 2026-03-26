/**
 * Headless screenshot capture.
 *
 * Launches the game in a headless browser via Playwright,
 * captures screenshots at a configurable FPS for a configurable duration,
 * and saves them to an output directory.
 *
 * Usage:
 *   npx tsx tooling/capture/capture.ts [options]
 *
 * Options:
 *   --duration   Capture duration in seconds (default: 5)
 *   --fps        Frames per second (default: 10)
 *   --width      Viewport width (default: 400)
 *   --height     Viewport height (default: 300)
 *   --output     Output directory (default: tooling/capture/output)
 *   --url        URL to capture (default: http://localhost:3000)
 *   --sample     Also save a sampled subset for agent review (every Nth frame)
 *   --wait       Seconds to wait before starting capture (default: 2)
 */

import { chromium } from "playwright";
import * as fs from "node:fs";
import * as path from "node:path";

function parseArgs() {
  const args = process.argv.slice(2);
  const opts: Record<string, string> = {};
  const flags = new Set<string>();
  for (let i = 0; i < args.length; i++) {
    const key = args[i]?.replace(/^--/, "");
    const next = args[i + 1];
    if (!key) continue;
    if (next && !next.startsWith("--")) {
      opts[key] = next;
      i++; // skip value
    } else {
      flags.add(key);
    }
  }
  return {
    duration: parseFloat(opts.duration ?? "5"),
    fps: parseInt(opts.fps ?? "10", 10),
    width: parseInt(opts.width ?? "400", 10),
    height: parseInt(opts.height ?? "300", 10),
    output: opts.output ?? "tooling/capture/output",
    url: opts.url ?? "http://localhost:4000",
    sample: parseInt(opts.sample ?? "5", 10),
    wait: parseFloat(opts.wait ?? "2"),
    headed: flags.has("headed"),
  };
}

async function main() {
  const opts = parseArgs();
  const totalFrames = Math.ceil(opts.duration * opts.fps);
  const intervalMs = 1000 / opts.fps;

  // Clean and create output directories
  const framesDir = path.join(opts.output, "frames");
  const sampledDir = path.join(opts.output, "sampled");

  if (fs.existsSync(opts.output)) {
    fs.rmSync(opts.output, { recursive: true });
  }
  fs.mkdirSync(framesDir, { recursive: true });
  fs.mkdirSync(sampledDir, { recursive: true });

  console.log(`Capturing ${totalFrames} frames at ${opts.fps}fps (${opts.duration}s)`);
  console.log(`Resolution: ${opts.width}x${opts.height}`);
  console.log(`URL: ${opts.url}`);
  console.log(`Output: ${opts.output}`);

  const browser = await chromium.launch({
    headless: !opts.headed,
    args: ["--use-gl=angle", "--use-angle=default"],
  });
  const context = await browser.newContext({
    viewport: { width: opts.width, height: opts.height },
    deviceScaleFactor: 1,
  });
  const page = await context.newPage();

  page.on("console", (msg) => console.log(`  [browser] ${msg.type()}: ${msg.text()}`));
  page.on("pageerror", (err) => console.error(`  [browser error] ${err.message}`));

  await page.goto(opts.url);
  console.log(`Waiting ${opts.wait}s for scene to initialise...`);
  await page.waitForTimeout(opts.wait * 1000);

  console.log("Capturing...");

  for (let i = 0; i < totalFrames; i++) {
    const frameNum = String(i).padStart(5, "0");
    const framePath = path.join(framesDir, `frame_${frameNum}.png`);

    await page.screenshot({ path: framePath, type: "png" });

    // Save sampled frames for agent review
    if (i % opts.sample === 0) {
      const sampledPath = path.join(sampledDir, `frame_${frameNum}.png`);
      fs.copyFileSync(framePath, sampledPath);
    }

    if (i < totalFrames - 1) {
      await page.waitForTimeout(intervalMs);
    }
  }

  await browser.close();

  // Write capture metadata
  const metadata = {
    timestamp: new Date().toISOString(),
    duration: opts.duration,
    fps: opts.fps,
    totalFrames,
    width: opts.width,
    height: opts.height,
    url: opts.url,
    sampleRate: opts.sample,
    sampledFrames: Math.ceil(totalFrames / opts.sample),
  };
  fs.writeFileSync(
    path.join(opts.output, "metadata.json"),
    JSON.stringify(metadata, null, 2),
    "utf-8",
  );

  console.log(`Done. ${totalFrames} frames saved, ${metadata.sampledFrames} sampled for review.`);
  console.log(`Sampled frames: ${sampledDir}`);
}

main().catch((err) => {
  console.error("Capture failed:", err);
  process.exit(1);
});

/**
 * Physics Validation Stories — Agent A (Micro)
 *
 * Each story runs the ACTUAL GPU physics WGSL shaders on a minimal particle set,
 * records positions over N frames via GPU readback, then draws trajectories on
 * a Canvas2D side-view. This validates the real compute code, not a CPU reference.
 *
 * Stories:
 *  1. GravityDrop     — 1 particle falls under gravity, no collision
 *  2. FloorBounce     — 1 particle bounces off floor, loses energy
 *  3. HeadOnCollision — 2 particles collide head-on on x-axis
 *  4. WallReflection  — 1 particle reflects off right wall
 *  5. SettlingPile    — 10 particles settle onto floor
 */

import {
  clearGridWgsl,
  populateGridWgsl,
  collisionWgsl,
  integrateWgsl,
  GRID_SIZE,
  MAX_PER_CELL,
  TOTAL_CELLS,
} from "../../../engine/gpu/systems/physics.js";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface ParticleInit {
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
  radius: number;
  restitution: number;
}

interface FrameSnapshot {
  /** Per-particle x positions */
  px: Float32Array;
  /** Per-particle y positions */
  py: Float32Array;
  /** Per-particle z positions */
  pz: Float32Array;
}

interface SimResult {
  frames: FrameSnapshot[];
  count: number;
  bounds: number;
}

// ---------------------------------------------------------------------------
// GPU simulation runner — runs physics for N frames and reads back positions
// ---------------------------------------------------------------------------

async function runSimulation(
  particles: ParticleInit[],
  numFrames: number,
  bounds: number,
  dt: number = 1 / 60,
): Promise<SimResult> {
  if (!navigator.gpu) throw new Error("WebGPU not available");
  const adapter = await navigator.gpu.requestAdapter();
  if (!adapter) throw new Error("No GPU adapter");
  const device = await adapter.requestDevice({
    requiredLimits: {
      maxStorageBuffersPerShaderStage: adapter.limits.maxStorageBuffersPerShaderStage,
    },
  });

  const N = particles.length;
  const CELL_SIZE = (bounds * 2) / GRID_SIZE;

  // --- CPU-side arrays ---
  const px = new Float32Array(N);
  const py = new Float32Array(N);
  const pz = new Float32Array(N);
  const velX = new Float32Array(N);
  const velY = new Float32Array(N);
  const velZ = new Float32Array(N);
  const radii = new Float32Array(N);
  const rest = new Float32Array(N);
  const forceX = new Float32Array(N);
  const forceY = new Float32Array(N);
  const forceZ = new Float32Array(N);
  const indices = new Uint32Array(N);

  for (let i = 0; i < N; i++) {
    const p = particles[i]!;
    px[i] = p.x;
    py[i] = p.y;
    pz[i] = p.z;
    velX[i] = p.vx;
    velY[i] = p.vy;
    velZ[i] = p.vz;
    radii[i] = p.radius;
    rest[i] = p.restitution;
    indices[i] = i;
  }

  // --- GPU buffers ---
  const SRW = GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST | GPUBufferUsage.COPY_SRC;
  const SR = GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST;
  const UNI = GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST;

  function makeBuf(data: Float32Array | Uint32Array | Int32Array, usage: number): GPUBuffer {
    const buf = device.createBuffer({ size: data.byteLength, usage });
    device.queue.writeBuffer(buf, 0, data.buffer, data.byteOffset, data.byteLength);
    return buf;
  }

  const pxBuf = makeBuf(px, SRW);
  const pyBuf = makeBuf(py, SRW);
  const pzBuf = makeBuf(pz, SRW);
  const vxBuf = makeBuf(velX, SRW);
  const vyBuf = makeBuf(velY, SRW);
  const vzBuf = makeBuf(velZ, SRW);
  const radBuf = makeBuf(radii, SR);
  const restBuf = makeBuf(rest, SR);
  const fxBuf = makeBuf(forceX, SRW);
  const fyBuf = makeBuf(forceY, SRW);
  const fzBuf = makeBuf(forceZ, SRW);
  const idxBuf = makeBuf(indices, SR);
  const gridBuf = device.createBuffer({
    size: TOTAL_CELLS * MAX_PER_CELL * 4,
    usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
  });

  // Readback staging buffers
  const readPxBuf = device.createBuffer({ size: N * 4, usage: GPUBufferUsage.MAP_READ | GPUBufferUsage.COPY_DST });
  const readPyBuf = device.createBuffer({ size: N * 4, usage: GPUBufferUsage.MAP_READ | GPUBufferUsage.COPY_DST });
  const readPzBuf = device.createBuffer({ size: N * 4, usage: GPUBufferUsage.MAP_READ | GPUBufferUsage.COPY_DST });

  // --- Compute pipelines ---
  const computeShaders = [clearGridWgsl, populateGridWgsl, collisionWgsl, integrateWgsl];
  const computePipelines = computeShaders.map((code) => {
    const module = device.createShaderModule({ code });
    return device.createComputePipeline({
      layout: "auto",
      compute: { module, entryPoint: "main" },
    });
  });

  // --- Uniforms ---
  const clearUniBuf = makeBuf(new Uint32Array([TOTAL_CELLS]), UNI);

  const popParams = new Float32Array(3);
  new Uint32Array(popParams.buffer)[0] = GRID_SIZE;
  popParams[1] = CELL_SIZE;
  popParams[2] = -bounds;
  const popUniBuf = makeBuf(popParams, UNI);
  const colUniBuf = makeBuf(popParams, UNI);
  const intUniBuf = makeBuf(new Float32Array([dt, -9.8, -bounds, bounds]), UNI);

  // --- Bind groups ---
  const clearBG = device.createBindGroup({
    layout: computePipelines[0]!.getBindGroupLayout(0),
    entries: [
      { binding: 0, resource: { buffer: clearUniBuf } },
      { binding: 1, resource: { buffer: gridBuf } },
    ],
  });
  const popBG = device.createBindGroup({
    layout: computePipelines[1]!.getBindGroupLayout(0),
    entries: [
      { binding: 0, resource: { buffer: popUniBuf } },
      { binding: 1, resource: { buffer: gridBuf } },
      { binding: 2, resource: { buffer: idxBuf } },
      { binding: 3, resource: { buffer: pxBuf } },
      { binding: 4, resource: { buffer: pyBuf } },
      { binding: 5, resource: { buffer: pzBuf } },
    ],
  });
  const colBG = device.createBindGroup({
    layout: computePipelines[2]!.getBindGroupLayout(0),
    entries: [
      { binding: 0, resource: { buffer: colUniBuf } },
      { binding: 1, resource: { buffer: gridBuf } },
      { binding: 2, resource: { buffer: idxBuf } },
      { binding: 3, resource: { buffer: pxBuf } },
      { binding: 4, resource: { buffer: pyBuf } },
      { binding: 5, resource: { buffer: pzBuf } },
      { binding: 6, resource: { buffer: radBuf } },
      { binding: 7, resource: { buffer: restBuf } },
      { binding: 8, resource: { buffer: vxBuf } },
      { binding: 9, resource: { buffer: vyBuf } },
      { binding: 10, resource: { buffer: vzBuf } },
    ],
  });
  const intBG = device.createBindGroup({
    layout: computePipelines[3]!.getBindGroupLayout(0),
    entries: [
      { binding: 0, resource: { buffer: intUniBuf } },
      { binding: 1, resource: { buffer: idxBuf } },
      { binding: 2, resource: { buffer: pxBuf } },
      { binding: 3, resource: { buffer: pyBuf } },
      { binding: 4, resource: { buffer: pzBuf } },
      { binding: 5, resource: { buffer: vxBuf } },
      { binding: 6, resource: { buffer: vyBuf } },
      { binding: 7, resource: { buffer: vzBuf } },
      { binding: 8, resource: { buffer: fxBuf } },
      { binding: 9, resource: { buffer: fyBuf } },
      { binding: 10, resource: { buffer: fzBuf } },
    ],
  });

  const gridWG = Math.ceil(TOTAL_CELLS / 64);
  const bodyWG = Math.ceil(N / 64);

  // --- Run simulation, recording each frame ---
  const frames: FrameSnapshot[] = [];

  // Record initial state
  frames.push({
    px: new Float32Array(px),
    py: new Float32Array(py),
    pz: new Float32Array(pz),
  });

  for (let f = 0; f < numFrames; f++) {
    // Dispatch 4-pass physics
    const encoder = device.createCommandEncoder();

    const c1 = encoder.beginComputePass();
    c1.setPipeline(computePipelines[0]!);
    c1.setBindGroup(0, clearBG);
    c1.dispatchWorkgroups(gridWG);
    c1.end();

    const c2 = encoder.beginComputePass();
    c2.setPipeline(computePipelines[1]!);
    c2.setBindGroup(0, popBG);
    c2.dispatchWorkgroups(bodyWG);
    c2.end();

    const c3 = encoder.beginComputePass();
    c3.setPipeline(computePipelines[2]!);
    c3.setBindGroup(0, colBG);
    c3.dispatchWorkgroups(bodyWG);
    c3.end();

    const c4 = encoder.beginComputePass();
    c4.setPipeline(computePipelines[3]!);
    c4.setBindGroup(0, intBG);
    c4.dispatchWorkgroups(bodyWG);
    c4.end();

    // Copy positions to staging for readback
    encoder.copyBufferToBuffer(pxBuf, 0, readPxBuf, 0, N * 4);
    encoder.copyBufferToBuffer(pyBuf, 0, readPyBuf, 0, N * 4);
    encoder.copyBufferToBuffer(pzBuf, 0, readPzBuf, 0, N * 4);

    device.queue.submit([encoder.finish()]);

    // Read back
    await readPxBuf.mapAsync(GPUMapMode.READ);
    await readPyBuf.mapAsync(GPUMapMode.READ);
    await readPzBuf.mapAsync(GPUMapMode.READ);

    frames.push({
      px: new Float32Array(readPxBuf.getMappedRange().slice(0)),
      py: new Float32Array(readPyBuf.getMappedRange().slice(0)),
      pz: new Float32Array(readPzBuf.getMappedRange().slice(0)),
    });

    readPxBuf.unmap();
    readPyBuf.unmap();
    readPzBuf.unmap();
  }

  device.destroy();
  return { frames, count: N, bounds };
}

// ---------------------------------------------------------------------------
// Canvas2D trajectory renderer
// ---------------------------------------------------------------------------

type Axis = "x" | "y";

interface DrawOpts {
  /** Which axes to plot. Default: x horizontal, y vertical. */
  hAxis?: "x" | "z";
  vAxis?: "y";
  /** Canvas pixel dimensions */
  width?: number;
  height?: number;
  /** Title text */
  title?: string;
  /** Per-particle colors (CSS strings). Falls back to palette. */
  colors?: string[];
  /** Validation checks — run after sim, results shown as text. */
  checks?: ValidationCheck[];
}

interface ValidationCheck {
  label: string;
  pass: (result: SimResult) => boolean;
}

const PALETTE = [
  "#ff8800",
  "#00bbff",
  "#44ff44",
  "#ff44ff",
  "#ffff00",
  "#ff4444",
  "#44ffff",
  "#ff8888",
  "#88ff88",
  "#8888ff",
];

function drawTrajectories(
  container: HTMLElement,
  result: SimResult,
  opts: DrawOpts = {},
) {
  const W = opts.width ?? 600;
  const H = opts.height ?? 400;
  const hAxis = opts.hAxis ?? "x";
  const title = opts.title ?? "Physics Validation";
  const checks = opts.checks ?? [];

  const canvas = document.createElement("canvas");
  canvas.width = W;
  canvas.height = H;
  canvas.style.display = "block";
  canvas.style.background = "#111";
  container.appendChild(canvas);

  const ctx = canvas.getContext("2d")!;

  // Coordinate mapping: simulation bounds -> canvas pixels
  // Horizontal: [-bounds, bounds] -> [margin, W-margin]
  // Vertical:   [-bounds, bounds] -> [H-margin, margin]  (y-up)
  const margin = 40;
  const B = result.bounds;

  function toCanvasX(v: number): number {
    return margin + ((v + B) / (2 * B)) * (W - 2 * margin);
  }
  function toCanvasY(v: number): number {
    return H - margin - ((v + B) / (2 * B)) * (H - 2 * margin);
  }

  // Background grid
  ctx.strokeStyle = "#333";
  ctx.lineWidth = 0.5;
  for (let g = -B; g <= B; g += 1) {
    const cx = toCanvasX(g);
    const cy = toCanvasY(g);
    ctx.beginPath();
    ctx.moveTo(cx, margin);
    ctx.lineTo(cx, H - margin);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(margin, cy);
    ctx.lineTo(W - margin, cy);
    ctx.stroke();
  }

  // Bounds box
  ctx.strokeStyle = "#555";
  ctx.lineWidth = 1;
  ctx.strokeRect(toCanvasX(-B), toCanvasY(B), toCanvasX(B) - toCanvasX(-B), toCanvasY(-B) - toCanvasY(B));

  // Floor line (y = -bounds)
  ctx.strokeStyle = "#885500";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(toCanvasX(-B), toCanvasY(-B));
  ctx.lineTo(toCanvasX(B), toCanvasY(-B));
  ctx.stroke();

  // Draw trajectories
  for (let p = 0; p < result.count; p++) {
    const color = (opts.colors ?? PALETTE)[p % PALETTE.length]!;

    // Trail line
    ctx.strokeStyle = color;
    ctx.globalAlpha = 0.3;
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (let f = 0; f < result.frames.length; f++) {
      const frame = result.frames[f]!;
      const hVal = hAxis === "x" ? frame.px[p]! : frame.pz[p]!;
      const vVal = frame.py[p]!;
      if (f === 0) ctx.moveTo(toCanvasX(hVal), toCanvasY(vVal));
      else ctx.lineTo(toCanvasX(hVal), toCanvasY(vVal));
    }
    ctx.stroke();
    ctx.globalAlpha = 1.0;

    // Dots at each frame (smaller for many frames)
    const dotR = result.frames.length > 100 ? 1.5 : 3;
    for (let f = 0; f < result.frames.length; f++) {
      const frame = result.frames[f]!;
      const hVal = hAxis === "x" ? frame.px[p]! : frame.pz[p]!;
      const vVal = frame.py[p]!;
      const alpha = 0.2 + 0.8 * (f / result.frames.length);
      ctx.fillStyle = color;
      ctx.globalAlpha = alpha;
      ctx.beginPath();
      ctx.arc(toCanvasX(hVal), toCanvasY(vVal), dotR, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1.0;

    // Start marker (green ring)
    const startFrame = result.frames[0]!;
    const sh = hAxis === "x" ? startFrame.px[p]! : startFrame.pz[p]!;
    ctx.strokeStyle = "#00ff00";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(toCanvasX(sh), toCanvasY(startFrame.py[p]!), 6, 0, Math.PI * 2);
    ctx.stroke();

    // End marker (red ring)
    const endFrame = result.frames[result.frames.length - 1]!;
    const eh = hAxis === "x" ? endFrame.px[p]! : endFrame.pz[p]!;
    ctx.strokeStyle = "#ff0000";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(toCanvasX(eh), toCanvasY(endFrame.py[p]!), 6, 0, Math.PI * 2);
    ctx.stroke();
  }

  // Title
  ctx.fillStyle = "#eee";
  ctx.font = "bold 14px monospace";
  ctx.fillText(title, margin, 20);

  // Axis labels
  ctx.fillStyle = "#888";
  ctx.font = "11px monospace";
  ctx.fillText(hAxis.toUpperCase(), W - margin + 5, H - margin + 4);
  ctx.fillText("Y", margin - 5, margin - 10);

  // Legend
  ctx.fillStyle = "#00ff00";
  ctx.fillText("O = start", W - 140, 20);
  ctx.fillStyle = "#ff0000";
  ctx.fillText("O = end", W - 140, 34);

  // Run checks and display results
  if (checks.length > 0) {
    const checksDiv = document.createElement("div");
    checksDiv.style.cssText =
      "font-family:monospace;font-size:12px;padding:8px 12px;background:#1a1a1a;color:#ccc;border-top:1px solid #333;";

    for (const check of checks) {
      const passed = check.pass(result);
      const icon = passed ? "\u2705" : "\u274c";
      const line = document.createElement("div");
      line.style.color = passed ? "#4caf50" : "#ef5350";
      line.textContent = `${icon} ${check.label}: ${passed ? "PASS" : "FAIL"}`;
      checksDiv.appendChild(line);
    }
    container.appendChild(checksDiv);
  }
}

// ---------------------------------------------------------------------------
// Storybook meta
// ---------------------------------------------------------------------------

export default {
  title:
    "Tickets/task-ESE-0020 GPU 3D physics optimizations: research and implement state-of-the-art improvements/Validation",
};

// ---------------------------------------------------------------------------
// 1. GravityDrop — single particle falls from y=5, no collision
// ---------------------------------------------------------------------------

export const GravityDrop = {
  render: () => {
    const container = document.createElement("div");
    container.style.cssText = "background:#111;padding:10px;";
    container.textContent = "Running GPU simulation...";

    const particles: ParticleInit[] = [
      { x: 0, y: 5, z: 0, vx: 0, vy: 0, vz: 0, radius: 0.12, restitution: 0.6 },
    ];

    runSimulation(particles, 120, 6)
      .then((result) => {
        container.textContent = "";
        drawTrajectories(container, result, {
          title: "1. GravityDrop: particle falls from y=5",
          checks: [
            {
              label: "Y decreases from start over first 30 frames",
              pass: (r) => {
                for (let f = 1; f <= 30 && f < r.frames.length; f++) {
                  if (r.frames[f]!.py[0]! >= r.frames[f - 1]!.py[0]!) return false;
                }
                return true;
              },
            },
            {
              label: "Particle reaches floor (y near -BOUNDS)",
              pass: (r) => {
                const lastY = r.frames[r.frames.length - 1]!.py[0]!;
                return lastY <= -r.bounds + 1.0;
              },
            },
            {
              label: "X stays near zero (no lateral drift)",
              pass: (r) => {
                for (const frame of r.frames) {
                  if (Math.abs(frame.px[0]!) > 0.1) return false;
                }
                return true;
              },
            },
          ],
        });
      })
      .catch((e) => {
        container.textContent = `Error: ${e.message}`;
        container.style.color = "#ef5350";
      });

    return container;
  },
};

// ---------------------------------------------------------------------------
// 2. FloorBounce — particle dropped from height, should bounce and settle
// ---------------------------------------------------------------------------

export const FloorBounce = {
  render: () => {
    const container = document.createElement("div");
    container.style.cssText = "background:#111;padding:10px;";
    container.textContent = "Running GPU simulation...";

    const particles: ParticleInit[] = [
      { x: 0, y: 4, z: 0, vx: 0, vy: 0, vz: 0, radius: 0.12, restitution: 0.6 },
    ];

    runSimulation(particles, 300, 5)
      .then((result) => {
        container.textContent = "";
        drawTrajectories(container, result, {
          title: "2. FloorBounce: drop, bounce, settle",
          checks: [
            {
              label: "Particle reaches floor at least once",
              pass: (r) => {
                return r.frames.some((f) => f.py[0]! <= -r.bounds + 0.5);
              },
            },
            {
              label: "Bounce detected (y increases after hitting floor)",
              pass: (r) => {
                let hitFloor = false;
                for (let f = 1; f < r.frames.length; f++) {
                  const y = r.frames[f]!.py[0]!;
                  const prevY = r.frames[f - 1]!.py[0]!;
                  if (y <= -r.bounds + 0.5) hitFloor = true;
                  if (hitFloor && y > prevY + 0.01) return true;
                }
                return false;
              },
            },
            {
              label: "Energy loss: final bounce height < initial drop height",
              pass: (r) => {
                const initialY = r.frames[0]!.py[0]!;
                // Find max y after first floor hit
                let hitFloor = false;
                let maxYAfterBounce = -Infinity;
                for (const frame of r.frames) {
                  const y = frame.py[0]!;
                  if (y <= -r.bounds + 0.5) hitFloor = true;
                  if (hitFloor && y > maxYAfterBounce) maxYAfterBounce = y;
                }
                return maxYAfterBounce < initialY;
              },
            },
            {
              label: "Particle settles near floor by end",
              pass: (r) => {
                const lastY = r.frames[r.frames.length - 1]!.py[0]!;
                return lastY <= -r.bounds + 2.0;
              },
            },
          ],
        });
      })
      .catch((e) => {
        container.textContent = `Error: ${e.message}`;
        container.style.color = "#ef5350";
      });

    return container;
  },
};

// ---------------------------------------------------------------------------
// 3. HeadOnCollision — 2 particles moving toward each other on x-axis
// ---------------------------------------------------------------------------

export const HeadOnCollision = {
  render: () => {
    const container = document.createElement("div");
    container.style.cssText = "background:#111;padding:10px;";
    container.textContent = "Running GPU simulation...";

    // Two particles at same y, approaching on x-axis
    const particles: ParticleInit[] = [
      { x: -2, y: 0, z: 0, vx: 4, vy: 0, vz: 0, radius: 0.2, restitution: 0.8 },
      { x: 2, y: 0, z: 0, vx: -4, vy: 0, vz: 0, radius: 0.2, restitution: 0.8 },
    ];

    runSimulation(particles, 120, 5)
      .then((result) => {
        container.textContent = "";
        drawTrajectories(container, result, {
          title: "3. HeadOnCollision: 2 particles bounce apart",
          checks: [
            {
              label: "Particles approach each other initially",
              pass: (r) => {
                const dx0 = Math.abs(r.frames[0]!.px[0]! - r.frames[0]!.px[1]!);
                const dx5 = Math.abs(r.frames[5]!.px[0]! - r.frames[5]!.px[1]!);
                return dx5 < dx0;
              },
            },
            {
              label: "Particles separate after collision",
              pass: (r) => {
                // Find closest approach
                let minDist = Infinity;
                let minFrame = 0;
                for (let f = 0; f < r.frames.length; f++) {
                  const dx = Math.abs(r.frames[f]!.px[0]! - r.frames[f]!.px[1]!);
                  if (dx < minDist) {
                    minDist = dx;
                    minFrame = f;
                  }
                }
                // Check they separate after closest approach
                if (minFrame + 10 >= r.frames.length) return false;
                const dxAfter = Math.abs(
                  r.frames[minFrame + 10]!.px[0]! - r.frames[minFrame + 10]!.px[1]!,
                );
                return dxAfter > minDist;
              },
            },
            {
              label: "Particle A reverses x-direction after collision",
              pass: (r) => {
                // A starts moving right (positive vx). After collision should move left.
                const startX = r.frames[0]!.px[0]!;
                const lastX = r.frames[r.frames.length - 1]!.px[0]!;
                // If particle bounced, it should end up to the left of where
                // it would have been without collision (x < 2)
                // Or more simply: it reversed, so final x < max x reached
                let maxX = -Infinity;
                for (const frame of r.frames) {
                  if (frame.px[0]! > maxX) maxX = frame.px[0]!;
                }
                return lastX < maxX - 0.1;
              },
            },
          ],
        });
      })
      .catch((e) => {
        container.textContent = `Error: ${e.message}`;
        container.style.color = "#ef5350";
      });

    return container;
  },
};

// ---------------------------------------------------------------------------
// 4. WallReflection — 1 particle moving toward right wall
// ---------------------------------------------------------------------------

export const WallReflection = {
  render: () => {
    const container = document.createElement("div");
    container.style.cssText = "background:#111;padding:10px;";
    container.textContent = "Running GPU simulation...";

    // Particle moving fast toward right wall (x = +BOUNDS)
    const particles: ParticleInit[] = [
      { x: 0, y: 0, z: 0, vx: 8, vy: 0, vz: 0, radius: 0.12, restitution: 0.6 },
    ];

    runSimulation(particles, 120, 5)
      .then((result) => {
        container.textContent = "";
        drawTrajectories(container, result, {
          title: "4. WallReflection: particle reflects off right wall",
          checks: [
            {
              label: "Particle reaches right wall region",
              pass: (r) => {
                return r.frames.some((f) => f.px[0]! >= r.bounds - 0.5);
              },
            },
            {
              label: "X-velocity flips (particle moves left after wall)",
              pass: (r) => {
                // Find when particle is near right wall
                let hitWall = false;
                for (let f = 1; f < r.frames.length; f++) {
                  if (r.frames[f]!.px[0]! >= r.bounds - 0.5) hitWall = true;
                  if (hitWall && r.frames[f]!.px[0]! < r.frames[f - 1]!.px[0]! - 0.01) {
                    return true;
                  }
                }
                return false;
              },
            },
            {
              label: "Particle stays within bounds after reflection",
              pass: (r) => {
                for (const frame of r.frames) {
                  if (frame.px[0]! > r.bounds + 0.1) return false;
                }
                return true;
              },
            },
          ],
        });
      })
      .catch((e) => {
        container.textContent = `Error: ${e.message}`;
        container.style.color = "#ef5350";
      });

    return container;
  },
};

// ---------------------------------------------------------------------------
// 5. SettlingPile — 10 particles dropped onto floor
// ---------------------------------------------------------------------------

export const SettlingPile = {
  render: () => {
    const container = document.createElement("div");
    container.style.cssText = "background:#111;padding:10px;";
    container.textContent = "Running GPU simulation (10 particles, 300 frames)...";

    // 10 particles in a cluster above center, slight random offsets
    const particles: ParticleInit[] = [];
    for (let i = 0; i < 10; i++) {
      particles.push({
        x: (i - 4.5) * 0.4,
        y: 3 + (i % 3) * 0.5,
        z: 0,
        vx: 0,
        vy: 0,
        vz: 0,
        radius: 0.15,
        restitution: 0.5,
      });
    }

    runSimulation(particles, 300, 5)
      .then((result) => {
        container.textContent = "";
        drawTrajectories(container, result, {
          title: "5. SettlingPile: 10 particles settle on floor",
          checks: [
            {
              label: "All particles reach lower half by end",
              pass: (r) => {
                const last = r.frames[r.frames.length - 1]!;
                for (let p = 0; p < r.count; p++) {
                  if (last.py[p]! > 0) return false;
                }
                return true;
              },
            },
            {
              label: "Particles spread out (not all stacked at one x)",
              pass: (r) => {
                const last = r.frames[r.frames.length - 1]!;
                let minX = Infinity;
                let maxX = -Infinity;
                for (let p = 0; p < r.count; p++) {
                  if (last.px[p]! < minX) minX = last.px[p]!;
                  if (last.px[p]! > maxX) maxX = last.px[p]!;
                }
                return maxX - minX > 0.5;
              },
            },
            {
              label: "No particle outside bounds at end",
              pass: (r) => {
                const last = r.frames[r.frames.length - 1]!;
                for (let p = 0; p < r.count; p++) {
                  if (
                    Math.abs(last.px[p]!) > r.bounds + 0.1 ||
                    Math.abs(last.py[p]!) > r.bounds + 0.1 ||
                    Math.abs(last.pz[p]!) > r.bounds + 0.1
                  )
                    return false;
                }
                return true;
              },
            },
            {
              label: "Particles mostly settled (low velocity by final frames)",
              pass: (r) => {
                // Check that positions are not changing much in last 20 frames
                const len = r.frames.length;
                if (len < 21) return false;
                let totalDrift = 0;
                for (let p = 0; p < r.count; p++) {
                  const dy = Math.abs(
                    r.frames[len - 1]!.py[p]! - r.frames[len - 20]!.py[p]!,
                  );
                  totalDrift += dy;
                }
                return totalDrift / r.count < 0.5;
              },
            },
          ],
        });
      })
      .catch((e) => {
        container.textContent = `Error: ${e.message}`;
        container.style.color = "#ef5350";
      });

    return container;
  },
};

/**
 * 2D GPU Physics Demo — circles bouncing inside world boundaries.
 * Auto-scales body count until 30fps.
 * Rendered with Canvas2D for simplicity (2D demo doesn't need Three.js).
 */

import {
  clearGrid2DWgsl,
  populateGrid2DWgsl,
  circleCollision2DWgsl,
  boundaryCollision2DWgsl,
  integrate2DWgsl,
  GRID_2D_SIZE,
  MAX_PER_CELL_2D,
  TOTAL_CELLS_2D,
} from "../../../engine/gpu/systems/physics-2d.js";

export default {
  title:
    "Tickets/feat-ESE-0019/feat-ESE-0019-04 Storybook demo: 2D circles with world boundaries/Demo",
};

async function create2DPhysicsDemo(container: HTMLElement) {
  const MAX_BODIES = 8192;
  const INITIAL_BODIES = 64;
  const TARGET_FPS = 30;
  const BOUNDS = 10;
  const CELL_SIZE = (BOUNDS * 2) / GRID_2D_SIZE;
  const CIRCLE_RADIUS = 0.15;

  if (!navigator.gpu) {
    container.textContent = "WebGPU not available";
    return;
  }
  const adapter = await navigator.gpu.requestAdapter();
  if (!adapter) {
    container.textContent = "No GPU adapter";
    return;
  }
  const device = await adapter.requestDevice({
    requiredLimits: {
      maxStorageBuffersPerShaderStage: adapter.limits.maxStorageBuffersPerShaderStage,
    },
  });

  // Compile 5 passes
  const shaders = [
    clearGrid2DWgsl,
    populateGrid2DWgsl,
    circleCollision2DWgsl,
    boundaryCollision2DWgsl,
    integrate2DWgsl,
  ];
  const pipelines = shaders.map((code) => {
    const module = device.createShaderModule({ code });
    return device.createComputePipeline({
      layout: "auto",
      compute: { module, entryPoint: "main" },
    });
  });

  // Body data (max capacity)
  const px = new Float32Array(MAX_BODIES);
  const py = new Float32Array(MAX_BODIES);
  const velX = new Float32Array(MAX_BODIES);
  const velY = new Float32Array(MAX_BODIES);
  const radii = new Float32Array(MAX_BODIES).fill(CIRCLE_RADIUS);
  const rest = new Float32Array(MAX_BODIES).fill(0.6);
  const forceX = new Float32Array(MAX_BODIES);
  const forceY = new Float32Array(MAX_BODIES);
  const indices = new Uint32Array(MAX_BODIES);

  function initBody(i: number): void {
    px[i] = (Math.random() - 0.5) * BOUNDS * 1.2;
    py[i] = BOUNDS * 0.3 + Math.random() * BOUNDS * 0.5;
    velX[i] = (Math.random() - 0.5) * 5;
    velY[i] = (Math.random() - 0.5) * 3;
    indices[i] = i;
  }

  for (let i = 0; i < MAX_BODIES; i++) initBody(i);
  let activeCount = INITIAL_BODIES;
  let stopped = false;

  // 4 world boundaries (box edges)
  const BOUNDARY_COUNT = 4;
  const bnx = new Float32Array([0, 0, 1, -1]); // bottom, top, left, right
  const bny = new Float32Array([1, -1, 0, 0]);
  const bdist = new Float32Array([-BOUNDS, -BOUNDS, -BOUNDS, -BOUNDS]);

  // GPU buffers
  function makeBuf(data: Float32Array | Uint32Array, usage: number): GPUBuffer {
    const buf = device.createBuffer({ size: data.byteLength, usage });
    device.queue.writeBuffer(buf, 0, data.buffer, data.byteOffset, data.byteLength);
    return buf;
  }

  const SRW = GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST | GPUBufferUsage.COPY_SRC;
  const SR = GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST;
  const UNI = GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST;

  const pxBuf = makeBuf(px, SRW);
  const pyBuf = makeBuf(py, SRW);
  const vxBuf = makeBuf(velX, SRW);
  const vyBuf = makeBuf(velY, SRW);
  const radBuf = makeBuf(radii, SR);
  const restBuf = makeBuf(rest, SR);
  const fxBuf = makeBuf(forceX, SRW);
  const fyBuf = makeBuf(forceY, SRW);
  const idxBuf = makeBuf(indices, SR);
  const bnxBuf = makeBuf(bnx, SR);
  const bnyBuf = makeBuf(bny, SR);
  const bdistBuf = makeBuf(bdist, SR);

  const gridBuf = device.createBuffer({
    size: TOTAL_CELLS_2D * MAX_PER_CELL_2D * 4,
    usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
  });

  // Uniforms
  const clearUniBuf = makeBuf(new Uint32Array([TOTAL_CELLS_2D]), UNI);

  const popParams = new Float32Array(3);
  new Uint32Array(popParams.buffer)[0] = GRID_2D_SIZE;
  popParams[1] = CELL_SIZE;
  popParams[2] = -BOUNDS;
  const popUniBuf = makeBuf(popParams, UNI);
  const colUniBuf = makeBuf(popParams, UNI);

  // Boundary collision params: boundaryCount (u32) + restitution (f32)
  const bndParams = new Float32Array(2);
  new Uint32Array(bndParams.buffer)[0] = BOUNDARY_COUNT;
  bndParams[1] = 0.7;
  const bndUniBuf = makeBuf(bndParams, UNI);

  const intParams = new Float32Array([1 / 60, -9.8]);
  const intUniBuf = makeBuf(intParams, UNI);

  // Bind groups
  const clearBG = device.createBindGroup({
    layout: pipelines[0]!.getBindGroupLayout(0),
    entries: [
      { binding: 0, resource: { buffer: clearUniBuf } },
      { binding: 1, resource: { buffer: gridBuf } },
    ],
  });
  const popBG = device.createBindGroup({
    layout: pipelines[1]!.getBindGroupLayout(0),
    entries: [
      { binding: 0, resource: { buffer: popUniBuf } },
      { binding: 1, resource: { buffer: gridBuf } },
      { binding: 2, resource: { buffer: idxBuf } },
      { binding: 3, resource: { buffer: pxBuf } },
      { binding: 4, resource: { buffer: pyBuf } },
    ],
  });
  const circleBG = device.createBindGroup({
    layout: pipelines[2]!.getBindGroupLayout(0),
    entries: [
      { binding: 0, resource: { buffer: colUniBuf } },
      { binding: 1, resource: { buffer: gridBuf } },
      { binding: 2, resource: { buffer: idxBuf } },
      { binding: 3, resource: { buffer: pxBuf } },
      { binding: 4, resource: { buffer: pyBuf } },
      { binding: 5, resource: { buffer: radBuf } },
      { binding: 6, resource: { buffer: restBuf } },
      { binding: 7, resource: { buffer: vxBuf } },
      { binding: 8, resource: { buffer: vyBuf } },
    ],
  });
  const bndBG = device.createBindGroup({
    layout: pipelines[3]!.getBindGroupLayout(0),
    entries: [
      { binding: 0, resource: { buffer: bndUniBuf } },
      { binding: 1, resource: { buffer: idxBuf } },
      { binding: 2, resource: { buffer: pxBuf } },
      { binding: 3, resource: { buffer: pyBuf } },
      { binding: 4, resource: { buffer: radBuf } },
      { binding: 5, resource: { buffer: vxBuf } },
      { binding: 6, resource: { buffer: vyBuf } },
      { binding: 7, resource: { buffer: bnxBuf } },
      { binding: 8, resource: { buffer: bnyBuf } },
      { binding: 9, resource: { buffer: bdistBuf } },
    ],
  });
  const intBG = device.createBindGroup({
    layout: pipelines[4]!.getBindGroupLayout(0),
    entries: [
      { binding: 0, resource: { buffer: intUniBuf } },
      { binding: 1, resource: { buffer: idxBuf } },
      { binding: 2, resource: { buffer: pxBuf } },
      { binding: 3, resource: { buffer: pyBuf } },
      { binding: 4, resource: { buffer: vxBuf } },
      { binding: 5, resource: { buffer: vyBuf } },
      { binding: 6, resource: { buffer: fxBuf } },
      { binding: 7, resource: { buffer: fyBuf } },
    ],
  });

  const gridWG = Math.ceil(TOTAL_CELLS_2D / 64);

  // Staging buffers
  const stagingPx = device.createBuffer({
    size: px.byteLength,
    usage: GPUBufferUsage.MAP_READ | GPUBufferUsage.COPY_DST,
  });
  const stagingPy = device.createBuffer({
    size: py.byteLength,
    usage: GPUBufferUsage.MAP_READ | GPUBufferUsage.COPY_DST,
  });

  // Canvas2D rendering
  const width = container.clientWidth || 800;
  const height = container.clientHeight || 600;
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  container.appendChild(canvas);
  const ctx = canvas.getContext("2d")!;

  const hudEl = document.createElement("div");
  hudEl.style.cssText =
    "position:absolute;top:10px;left:10px;color:#eee;font-family:monospace;font-size:13px;background:rgba(0,0,0,0.7);padding:8px 12px;border-radius:4px;pointer-events:none;";
  container.style.position = "relative";
  container.appendChild(hudEl);

  // World-to-screen mapping
  const scale = Math.min(width, height) / (BOUNDS * 2.2);
  const cx = width / 2;
  const cy = height / 2;
  function worldToScreen(wx: number, wy: number): [number, number] {
    return [cx + wx * scale, cy - wy * scale]; // flip Y
  }

  let lastTime = performance.now();
  let fpsAccum = 0;
  let fpsCount = 0;
  let displayFps = 60; // assume 60fps initially to avoid premature stop
  let growthTimer = 0;
  let warmupTimer = 0;
  const WARMUP_MS = 3000; // wait 3 seconds before starting growth
  let destroyed = false;

  async function frame() {
    if (destroyed) return;
    const now = performance.now();
    const dt = now - lastTime;
    fpsAccum += dt;
    lastTime = now;
    fpsCount++;
    if (fpsAccum >= 1000) {
      displayFps = Math.round((fpsCount * 1000) / fpsAccum);
      fpsAccum = 0;
      fpsCount = 0;
    }

    // Grow body count (after warmup)
    warmupTimer += dt;
    if (!stopped && warmupTimer > WARMUP_MS) {
      growthTimer += dt;
      if (growthTimer >= 1000 && displayFps > 0) {
        growthTimer = 0;
        if (displayFps > TARGET_FPS && activeCount < MAX_BODIES) {
          const toAdd = Math.max(8, Math.ceil(activeCount * 0.05));
          const newCount = Math.min(activeCount + toAdd, MAX_BODIES);
          for (let i = activeCount; i < newCount; i++) initBody(i);
          activeCount = newCount;
          device.queue.writeBuffer(idxBuf, 0, indices.buffer, 0, activeCount * 4);
        } else {
          stopped = true;
        }
      }
    }

    const bodyWG = Math.ceil(activeCount / 64);

    // 5-pass GPU physics
    const encoder = device.createCommandEncoder();

    const p1 = encoder.beginComputePass();
    p1.setPipeline(pipelines[0]!);
    p1.setBindGroup(0, clearBG);
    p1.dispatchWorkgroups(gridWG);
    p1.end();

    const p2 = encoder.beginComputePass();
    p2.setPipeline(pipelines[1]!);
    p2.setBindGroup(0, popBG);
    p2.dispatchWorkgroups(bodyWG);
    p2.end();

    const p3 = encoder.beginComputePass();
    p3.setPipeline(pipelines[2]!);
    p3.setBindGroup(0, circleBG);
    p3.dispatchWorkgroups(bodyWG);
    p3.end();

    const p4 = encoder.beginComputePass();
    p4.setPipeline(pipelines[3]!);
    p4.setBindGroup(0, bndBG);
    p4.dispatchWorkgroups(bodyWG);
    p4.end();

    const p5 = encoder.beginComputePass();
    p5.setPipeline(pipelines[4]!);
    p5.setBindGroup(0, intBG);
    p5.dispatchWorkgroups(bodyWG);
    p5.end();

    encoder.copyBufferToBuffer(pxBuf, 0, stagingPx, 0, px.byteLength);
    encoder.copyBufferToBuffer(pyBuf, 0, stagingPy, 0, py.byteLength);
    device.queue.submit([encoder.finish()]);

    await stagingPx.mapAsync(GPUMapMode.READ);
    await stagingPy.mapAsync(GPUMapMode.READ);
    px.set(new Float32Array(stagingPx.getMappedRange()));
    py.set(new Float32Array(stagingPy.getMappedRange()));
    stagingPx.unmap();
    stagingPy.unmap();

    // Render with Canvas2D
    ctx.fillStyle = "#111";
    ctx.fillRect(0, 0, width, height);

    // Draw world boundaries
    ctx.strokeStyle = "#555";
    ctx.lineWidth = 1;
    for (let b = 0; b < BOUNDARY_COUNT; b++) {
      const nx = bnx[b]!;
      const ny = bny[b]!;
      const d = bdist[b]!;
      // Point on line: normal * dist
      const lx = nx * d;
      const ly = ny * d;
      // Line direction (perpendicular to normal)
      const dx = -ny;
      const dy = nx;
      const [x1, y1] = worldToScreen(lx - dx * 50, ly - dy * 50);
      const [x2, y2] = worldToScreen(lx + dx * 50, ly + dy * 50);
      ctx.beginPath();
      ctx.moveTo(x1, y1);
      ctx.lineTo(x2, y2);
      ctx.stroke();
    }

    // Draw circles
    ctx.fillStyle = "#ff8800";
    const screenRadius = CIRCLE_RADIUS * scale;
    for (let i = 0; i < activeCount; i++) {
      const [sx, sy] = worldToScreen(px[i]!, py[i]!);
      ctx.beginPath();
      ctx.arc(sx, sy, screenRadius, 0, Math.PI * 2);
      ctx.fill();
    }

    const status = stopped
      ? activeCount >= MAX_BODIES
        ? "MAX"
        : `stopped @ ${TARGET_FPS}fps`
      : "growing...";
    hudEl.textContent = `${activeCount} circles | ${displayFps} fps | 2D GPU physics | ${status}`;

    requestAnimationFrame(frame);
  }

  requestAnimationFrame(frame);
  return () => {
    destroyed = true;
    device.destroy();
  };
}

export const Demo = {
  render: () => {
    const container = document.createElement("div");
    container.style.cssText = "width: 100%; height: 600px; background: #111;";
    setTimeout(() => create2DPhysicsDemo(container), 0);
    return container;
  },
};

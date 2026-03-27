/**
 * Optimized 3D GPU Physics Demo — zero-copy rendering with particles.
 *
 * - NO readback (mapAsync) — compute + render in one submit
 * - Particle billboards instead of sphere geometry
 * - Accurate FPS via onSubmittedWorkDone
 * - Fixed camera with proper lighting
 * - Auto-scales until GPU fps drops to 40
 */

import {
  clearGridWgsl,
  populateGridWgsl,
  collisionWgsl,
  integrateWgsl,
  GRID_SIZE,
  MAX_PER_CELL,
  TOTAL_CELLS,
} from "../../engine/gpu/systems/physics.js";
import {
  particleVertexWgsl,
  particleFragmentWgsl,
} from "../../engine/gpu/render/particle-renderer.js";

export default {
  title:
    "Tickets/task-ESE-0020 GPU 3D physics optimizations: research and implement state-of-the-art improvements/Demo",
};

async function createOptimizedDemo(container: HTMLElement) {
  const MAX_BODIES = 65536;
  const INITIAL_BODIES = 64;
  const TARGET_FPS = 40;
  const BOUNDS = 10;
  const CELL_SIZE = (BOUNDS * 2) / GRID_SIZE;
  const SPHERE_RADIUS = 0.25;

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
      maxStorageBufferBindingSize: adapter.limits.maxStorageBufferBindingSize,
    },
  });

  const width = container.clientWidth || 800;
  const height = container.clientHeight || 600;

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  container.appendChild(canvas);

  const gpuCtx = canvas.getContext("webgpu")!;
  const format = navigator.gpu.getPreferredCanvasFormat();
  gpuCtx.configure({ device, format, alphaMode: "opaque" });

  const depthTexture = device.createTexture({
    size: [width, height],
    format: "depth24plus",
    usage: GPUTextureUsage.RENDER_ATTACHMENT,
  });

  // --- Compute pipelines ---
  const computeShaders = [clearGridWgsl, populateGridWgsl, collisionWgsl, integrateWgsl];
  const computePipelines = computeShaders.map((code) => {
    const module = device.createShaderModule({ code });
    return device.createComputePipeline({
      layout: "auto",
      compute: { module, entryPoint: "main" },
    });
  });

  // --- Body data ---
  const px = new Float32Array(MAX_BODIES);
  const py = new Float32Array(MAX_BODIES);
  const pz = new Float32Array(MAX_BODIES);
  const velX = new Float32Array(MAX_BODIES);
  const velY = new Float32Array(MAX_BODIES);
  const velZ = new Float32Array(MAX_BODIES);
  const radii = new Float32Array(MAX_BODIES).fill(SPHERE_RADIUS);
  const rest = new Float32Array(MAX_BODIES).fill(0.6);
  const forceX = new Float32Array(MAX_BODIES);
  const forceY = new Float32Array(MAX_BODIES);
  const forceZ = new Float32Array(MAX_BODIES);
  const indices = new Uint32Array(MAX_BODIES);

  function initBody(i: number): void {
    px[i] = (Math.random() - 0.5) * BOUNDS * 1.5;
    py[i] = BOUNDS * 0.5 + Math.random() * BOUNDS * 0.5;
    pz[i] = (Math.random() - 0.5) * BOUNDS * 1.5;
    velX[i] = (Math.random() - 0.5) * 3;
    velY[i] = (Math.random() - 0.5) * 2;
    velZ[i] = (Math.random() - 0.5) * 3;
    indices[i] = i;
  }
  for (let i = 0; i < MAX_BODIES; i++) initBody(i);
  let activeCount = INITIAL_BODIES;
  let stopped = false;

  // --- GPU buffers ---
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

  // Compute uniforms
  const clearUniBuf = makeBuf(new Uint32Array([TOTAL_CELLS]), UNI);
  const popParams = new Float32Array(3);
  new Uint32Array(popParams.buffer)[0] = GRID_SIZE;
  popParams[1] = CELL_SIZE;
  popParams[2] = -BOUNDS;
  const popUniBuf = makeBuf(popParams, UNI);
  const colUniBuf = makeBuf(popParams, UNI);
  const intUniBuf = makeBuf(new Float32Array([1 / 60, -9.8, -BOUNDS, BOUNDS]), UNI);

  // Compute bind groups
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

  // --- Particle render pipeline ---
  const vertModule = device.createShaderModule({ code: particleVertexWgsl });
  const fragModule = device.createShaderModule({ code: particleFragmentWgsl });

  const renderPipeline = device.createRenderPipeline({
    layout: "auto",
    vertex: {
      module: vertModule,
      entryPoint: "main",
      buffers: [], // no vertex buffers — positions from storage
    },
    fragment: {
      module: fragModule,
      entryPoint: "main",
      targets: [{ format }],
    },
    depthStencil: {
      format: "depth24plus",
      depthWriteEnabled: true,
      depthCompare: "less",
    },
    primitive: {
      topology: "triangle-list",
    },
  });

  // Camera uniform: mat4x4f (64 bytes) + screenHeight (4) + particleRadius (4) + aspectRatio (4) + padding (4) = 80
  const cameraBuf = device.createBuffer({ size: 80, usage: UNI });

  const renderBG = device.createBindGroup({
    layout: renderPipeline.getBindGroupLayout(0),
    entries: [
      { binding: 0, resource: { buffer: cameraBuf } },
      { binding: 1, resource: { buffer: pxBuf } },
      { binding: 2, resource: { buffer: pyBuf } },
      { binding: 3, resource: { buffer: pzBuf } },
    ],
  });

  // Matrix helpers
  function mat4Perspective(fov: number, aspect: number, near: number, far: number): Float32Array {
    const f = 1 / Math.tan(fov / 2);
    const rangeInv = 1 / (near - far);
    return new Float32Array([
      f / aspect,
      0,
      0,
      0,
      0,
      f,
      0,
      0,
      0,
      0,
      (near + far) * rangeInv,
      -1,
      0,
      0,
      near * far * rangeInv * 2,
      0,
    ]);
  }

  function mat4LookAt(eye: number[], target: number[], up: number[]): Float32Array {
    const zx = eye[0]! - target[0]!,
      zy = eye[1]! - target[1]!,
      zz = eye[2]! - target[2]!;
    const zl = Math.sqrt(zx * zx + zy * zy + zz * zz);
    const z = [zx / zl, zy / zl, zz / zl];
    const xx = up[1]! * z[2]! - up[2]! * z[1]!,
      xy = up[2]! * z[0]! - up[0]! * z[2]!,
      xz = up[0]! * z[1]! - up[1]! * z[0]!;
    const xl = Math.sqrt(xx * xx + xy * xy + xz * xz);
    const x = [xx / xl, xy / xl, xz / xl];
    const y = [
      z[1]! * x[2]! - z[2]! * x[1]!,
      z[2]! * x[0]! - z[0]! * x[2]!,
      z[0]! * x[1]! - z[1]! * x[0]!,
    ];
    return new Float32Array([
      x[0]!,
      y[0]!,
      z[0]!,
      0,
      x[1]!,
      y[1]!,
      z[1]!,
      0,
      x[2]!,
      y[2]!,
      z[2]!,
      0,
      -(x[0]! * eye[0]! + x[1]! * eye[1]! + x[2]! * eye[2]!),
      -(y[0]! * eye[0]! + y[1]! * eye[1]! + y[2]! * eye[2]!),
      -(z[0]! * eye[0]! + z[1]! * eye[1]! + z[2]! * eye[2]!),
      1,
    ]);
  }

  function mat4Multiply(a: Float32Array, b: Float32Array): Float32Array {
    const out = new Float32Array(16);
    for (let i = 0; i < 4; i++) {
      for (let j = 0; j < 4; j++) {
        out[i * 4 + j] =
          a[j]! * b[i * 4]! +
          a[4 + j]! * b[i * 4 + 1]! +
          a[8 + j]! * b[i * 4 + 2]! +
          a[12 + j]! * b[i * 4 + 3]!;
      }
    }
    return out;
  }

  // HUD
  const hudEl = document.createElement("div");
  hudEl.style.cssText =
    "position:absolute;top:10px;left:10px;color:#eee;font-family:monospace;font-size:13px;background:rgba(0,0,0,0.7);padding:8px 12px;border-radius:4px;pointer-events:none;line-height:1.6;";
  container.style.position = "relative";
  container.appendChild(hudEl);

  // Fixed camera — looking at scene from front-above
  const proj = mat4Perspective(Math.PI / 3, width / height, 0.1, 200);
  const view = mat4LookAt([0, BOUNDS * 1.2, BOUNDS * 2.5], [0, -BOUNDS * 0.3, 0], [0, 1, 0]);
  const viewProj = mat4Multiply(proj, view);

  // Upload camera once (fixed)
  const cameraData = new Float32Array(20); // 16 matrix + screenHeight + particleRadius + aspectRatio + pad
  cameraData.set(viewProj);
  cameraData[16] = height;
  cameraData[17] = SPHERE_RADIUS;
  cameraData[18] = width / height;
  device.queue.writeBuffer(cameraBuf, 0, cameraData);

  // --- Timing ---
  let physicsFps = 60;
  let renderFps = 60;
  let frameTimesMs: number[] = [];
  let lastRenderTime = performance.now();
  let pendingGpuFrames = 0;
  let gpuCompleted = 0;
  let gpuMeasureStart = performance.now();
  let growthTimer = 0;
  let warmupTimer = 0;
  const WARMUP_MS = 3000;
  let destroyed = false;

  function frame() {
    if (destroyed) return;

    const renderStart = performance.now();
    const renderDt = renderStart - lastRenderTime;
    lastRenderTime = renderStart;
    frameTimesMs.push(renderDt);

    const bodyWG = Math.ceil(activeCount / 64);

    const encoder = device.createCommandEncoder();

    // 4-pass compute
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

    // Render pass — zero copy from storage buffers
    const renderPass = encoder.beginRenderPass({
      colorAttachments: [
        {
          view: gpuCtx.getCurrentTexture().createView(),
          clearValue: { r: 0.067, g: 0.067, b: 0.067, a: 1 },
          loadOp: "clear" as GPULoadOp,
          storeOp: "store" as GPUStoreOp,
        },
      ],
      depthStencilAttachment: {
        view: depthTexture.createView(),
        depthClearValue: 1.0,
        depthLoadOp: "clear" as GPULoadOp,
        depthStoreOp: "store" as GPUStoreOp,
      },
    });
    renderPass.setPipeline(renderPipeline);
    renderPass.setBindGroup(0, renderBG);
    renderPass.draw(6, activeCount); // 6 verts per billboard quad, N instances
    renderPass.end();

    device.queue.submit([encoder.finish()]);

    // Track GPU throughput by counting completed frames per second
    pendingGpuFrames++;
    device.queue.onSubmittedWorkDone().then(() => {
      gpuCompleted++;
    });

    // Calculate fps every second
    if (frameTimesMs.length >= 10) {
      const avgMs = frameTimesMs.reduce((a, b) => a + b, 0) / frameTimesMs.length;
      renderFps = avgMs > 0 ? Math.round(1000 / avgMs) : 999;
      frameTimesMs = [];

      // Physics fps = GPU frames completed per second
      const elapsed = (performance.now() - gpuMeasureStart) / 1000;
      if (elapsed > 0.5) {
        physicsFps = Math.round(gpuCompleted / elapsed);
        gpuCompleted = 0;
        gpuMeasureStart = performance.now();
      }
    }

    const effectiveFps = Math.min(physicsFps, renderFps);

    // Growth
    warmupTimer += renderDt;
    if (!stopped && warmupTimer > WARMUP_MS) {
      growthTimer += renderDt;
      if (growthTimer >= 1000) {
        growthTimer = 0;
        if (effectiveFps > TARGET_FPS && activeCount < MAX_BODIES) {
          const toAdd = Math.max(32, Math.ceil(activeCount * 0.2));
          const newCount = Math.min(activeCount + toAdd, MAX_BODIES);
          for (let i = activeCount; i < newCount; i++) initBody(i);
          activeCount = newCount;
          device.queue.writeBuffer(idxBuf, 0, indices.buffer, 0, activeCount * 4);
        } else {
          stopped = true;
        }
      }
    }

    const status = stopped
      ? activeCount >= MAX_BODIES
        ? "MAX"
        : `stopped @ ${TARGET_FPS}fps`
      : "growing...";
    hudEl.innerHTML =
      `${activeCount} particles | ${status}<br>` +
      `Physics: ${physicsFps} fps | Render: ${renderFps} fps<br>` +
      `ZERO-COPY compute+render`;

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
    container.style.cssText =
      "width: 100%; height: 600px; background: #111; color: #eee; font-family: monospace; padding: 20px;";
    container.textContent = "Initializing WebGPU...";
    setTimeout(() => {
      createOptimizedDemo(container).catch((e) => {
        container.textContent = `Error: ${e.message}\n\n${e.stack}`;
        container.style.whiteSpace = "pre-wrap";
        container.style.color = "#ef5350";
        console.error("Demo error:", e);
      });
    }, 100);
    return container;
  },
};

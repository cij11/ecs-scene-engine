/**
 * Packed vec4f GPU Physics Demo — impulse accumulation, zero-copy rendering.
 *
 * Uses physics-packed.ts which packs position+radius and velocity+restitution
 * into vec4f buffers and separates collision impulse accumulation to fix
 * the race condition in the original physics.ts.
 *
 * - Max 5000 bodies, BOUNDS=5
 * - Await GPU each frame (honest fps)
 * - Fixed camera
 * - Auto-growth, stop at 40fps, free resources after 5 seconds
 * - Billboard quad particle rendering
 */

import {
  clearGridPackedWgsl,
  populateGridPackedWgsl,
  collisionPackedWgsl,
  integratePackedWgsl,
  particleVertexPackedWgsl,
  GRID_SIZE_PACKED,
  MAX_PER_CELL_PACKED,
  TOTAL_CELLS_PACKED,
} from "../../engine/gpu/systems/physics-packed.js";
import { particleFragmentWgsl } from "../../engine/gpu/render/particle-renderer.js";

export default {
  title:
    "Tickets/task-ESE-0020 GPU 3D physics optimizations: research and implement state-of-the-art improvements/Demo Packed",
};

async function createPackedDemo(container: HTMLElement) {
  const MAX_BODIES = 20000;
  const INITIAL_BODIES = 64;
  const TARGET_FPS = 40;
  const BOUNDS = 5;
  const CELL_SIZE = (BOUNDS * 2) / GRID_SIZE_PACKED;
  const SPHERE_RADIUS = 0.12;

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

  // --- Compute pipelines (4 passes) ---
  const computeShaders = [
    clearGridPackedWgsl,
    populateGridPackedWgsl,
    collisionPackedWgsl,
    integratePackedWgsl,
  ];
  const computePipelines = computeShaders.map((code) => {
    const module = device.createShaderModule({ code });
    return device.createComputePipeline({
      layout: "auto",
      compute: { module, entryPoint: "main" },
    });
  });

  // --- Packed body data (vec4f layout) ---
  // pos: xyz=position, w=radius
  // vel: xyz=velocity, w=restitution
  // force: xyz=force, w=mass (unused)
  // impulse: xyz=accumulated impulse, w=unused
  const pos = new Float32Array(MAX_BODIES * 4);
  const vel = new Float32Array(MAX_BODIES * 4);
  const force = new Float32Array(MAX_BODIES * 4);
  const impulse = new Float32Array(MAX_BODIES * 4); // zeroed
  const indices = new Uint32Array(MAX_BODIES);

  function initBody(i: number): void {
    const base = i * 4;
    // pos: xyz + radius in w
    pos[base + 0] = (Math.random() - 0.5) * BOUNDS * 1.2;
    pos[base + 1] = BOUNDS * 0.3 + Math.random() * BOUNDS * 0.6;
    pos[base + 2] = (Math.random() - 0.5) * BOUNDS * 1.2;
    pos[base + 3] = SPHERE_RADIUS;
    // vel: xyz + restitution in w
    vel[base + 0] = (Math.random() - 0.5) * 2;
    vel[base + 1] = (Math.random() - 0.5) * 1;
    vel[base + 2] = (Math.random() - 0.5) * 2;
    vel[base + 3] = 0.6;
    // force: zeroed (gravity applied in integrate shader)
    force[base + 0] = 0;
    force[base + 1] = 0;
    force[base + 2] = 0;
    force[base + 3] = 1.0; // mass
    // impulse: zeroed at start
    impulse[base + 0] = 0;
    impulse[base + 1] = 0;
    impulse[base + 2] = 0;
    impulse[base + 3] = 0;

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

  const posBuf = makeBuf(pos, SRW);
  const velBuf = makeBuf(vel, SRW);
  const forceBuf = makeBuf(force, SRW);
  const impulseBuf = makeBuf(impulse, SRW);
  const idxBuf = makeBuf(indices, SR);
  const gridBuf = device.createBuffer({
    size: TOTAL_CELLS_PACKED * MAX_PER_CELL_PACKED * 4,
    usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
  });

  // Compute uniforms
  const clearUniBuf = makeBuf(new Uint32Array([TOTAL_CELLS_PACKED]), UNI);

  const popParams = new Float32Array(3);
  new Uint32Array(popParams.buffer)[0] = GRID_SIZE_PACKED;
  popParams[1] = CELL_SIZE;
  popParams[2] = -BOUNDS;
  const popUniBuf = makeBuf(popParams, UNI);
  const colUniBuf = makeBuf(popParams, UNI); // same params for collision grid lookup
  const SUB_STEPS = 4;
  const subDt = (1 / 60) / SUB_STEPS;
  const intUniBuf = makeBuf(new Float32Array([subDt, -9.8, -BOUNDS, BOUNDS]), UNI);

  // --- Bind groups ---

  // Pass 1: Clear grid
  const clearBG = device.createBindGroup({
    layout: computePipelines[0]!.getBindGroupLayout(0),
    entries: [
      { binding: 0, resource: { buffer: clearUniBuf } },
      { binding: 1, resource: { buffer: gridBuf } },
    ],
  });

  // Pass 2: Populate grid — reads pos (vec4f)
  const popBG = device.createBindGroup({
    layout: computePipelines[1]!.getBindGroupLayout(0),
    entries: [
      { binding: 0, resource: { buffer: popUniBuf } },
      { binding: 1, resource: { buffer: gridBuf } },
      { binding: 2, resource: { buffer: idxBuf } },
      { binding: 3, resource: { buffer: posBuf } },
    ],
  });

  // Pass 3: Collision — reads pos, vel; writes impulse
  const colBG = device.createBindGroup({
    layout: computePipelines[2]!.getBindGroupLayout(0),
    entries: [
      { binding: 0, resource: { buffer: colUniBuf } },
      { binding: 1, resource: { buffer: gridBuf } },
      { binding: 2, resource: { buffer: idxBuf } },
      { binding: 3, resource: { buffer: posBuf } },
      { binding: 4, resource: { buffer: velBuf } },
      { binding: 5, resource: { buffer: impulseBuf } },
    ],
  });

  // Pass 4: Integrate — reads/writes pos, vel, force, impulse
  const intBG = device.createBindGroup({
    layout: computePipelines[3]!.getBindGroupLayout(0),
    entries: [
      { binding: 0, resource: { buffer: intUniBuf } },
      { binding: 1, resource: { buffer: idxBuf } },
      { binding: 2, resource: { buffer: posBuf } },
      { binding: 3, resource: { buffer: velBuf } },
      { binding: 4, resource: { buffer: forceBuf } },
      { binding: 5, resource: { buffer: impulseBuf } },
    ],
  });

  const gridWG = Math.ceil(TOTAL_CELLS_PACKED / 64);

  // --- Particle render pipeline (packed vertex shader) ---
  const vertModule = device.createShaderModule({ code: particleVertexPackedWgsl });
  const fragModule = device.createShaderModule({ code: particleFragmentWgsl });

  const renderPipeline = device.createRenderPipeline({
    layout: "auto",
    vertex: {
      module: vertModule,
      entryPoint: "main",
      buffers: [],
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

  // Camera uniform: mat4x4f (64 bytes) + screenHeight (4) + particleRadius (4) + aspectRatio (4) + pad (4) = 80
  const cameraBuf = device.createBuffer({ size: 80, usage: UNI });

  // Render bind group — only needs pos buffer (vec4f) instead of separate px/py/pz
  const renderBG = device.createBindGroup({
    layout: renderPipeline.getBindGroupLayout(0),
    entries: [
      { binding: 0, resource: { buffer: cameraBuf } },
      { binding: 1, resource: { buffer: posBuf } },
    ],
  });

  // --- Matrix helpers ---
  function mat4Perspective(fov: number, aspect: number, near: number, far: number): Float32Array {
    const f = 1 / Math.tan(fov / 2);
    const rangeInv = 1 / (near - far);
    return new Float32Array([
      f / aspect, 0, 0, 0,
      0, f, 0, 0,
      0, 0, (near + far) * rangeInv, -1,
      0, 0, near * far * rangeInv * 2, 0,
    ]);
  }

  function mat4LookAt(eye: number[], target: number[], up: number[]): Float32Array {
    const zx = eye[0]! - target[0]!, zy = eye[1]! - target[1]!, zz = eye[2]! - target[2]!;
    const zl = Math.sqrt(zx * zx + zy * zy + zz * zz);
    const z = [zx / zl, zy / zl, zz / zl];
    const xx = up[1]! * z[2]! - up[2]! * z[1]!, xy = up[2]! * z[0]! - up[0]! * z[2]!, xz = up[0]! * z[1]! - up[1]! * z[0]!;
    const xl = Math.sqrt(xx * xx + xy * xy + xz * xz);
    const x = [xx / xl, xy / xl, xz / xl];
    const y = [
      z[1]! * x[2]! - z[2]! * x[1]!,
      z[2]! * x[0]! - z[0]! * x[2]!,
      z[0]! * x[1]! - z[1]! * x[0]!,
    ];
    return new Float32Array([
      x[0]!, y[0]!, z[0]!, 0,
      x[1]!, y[1]!, z[1]!, 0,
      x[2]!, y[2]!, z[2]!, 0,
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

  // Fixed camera
  const proj = mat4Perspective(Math.PI / 3, width / height, 0.1, 200);
  const view = mat4LookAt([0, BOUNDS * 1.5, BOUNDS * 3], [0, -BOUNDS * 0.2, 0], [0, 1, 0]);
  const viewProj = mat4Multiply(proj, view);

  const cameraData = new Float32Array(20);
  cameraData.set(viewProj);
  cameraData[16] = height;
  cameraData[17] = SPHERE_RADIUS;
  cameraData[18] = width / height;
  device.queue.writeBuffer(cameraBuf, 0, cameraData);

  // --- Timing ---
  let displayFps = 60;
  let frameTimesMs: number[] = [];
  let lastRenderTime = performance.now();
  let stoppedAt = 0;
  let growthTimer = 0;
  let warmupTimer = 0;
  const WARMUP_MS = 3000;
  let destroyed = false;

  async function frame() {
    if (destroyed) return;

    const frameStart = performance.now();
    const frameDt = frameStart - lastRenderTime;
    lastRenderTime = frameStart;

    const bodyWG = Math.ceil(activeCount / 64);

    const encoder = device.createCommandEncoder();

    for (let step = 0; step < SUB_STEPS; step++) {
      // Clear grid
      const c1 = encoder.beginComputePass();
      c1.setPipeline(computePipelines[0]!);
      c1.setBindGroup(0, clearBG);
      c1.dispatchWorkgroups(gridWG);
      c1.end();

      // Populate grid (reads updated positions from previous sub-step)
      const c2 = encoder.beginComputePass();
      c2.setPipeline(computePipelines[1]!);
      c2.setBindGroup(0, popBG);
      c2.dispatchWorkgroups(bodyWG);
      c2.end();

      // Collision (writes impulses based on current positions)
      const c3 = encoder.beginComputePass();
      c3.setPipeline(computePipelines[2]!);
      c3.setBindGroup(0, colBG);
      c3.dispatchWorkgroups(bodyWG);
      c3.end();

      // Integrate (applies impulse + force/gravity, updates pos/vel)
      const c4 = encoder.beginComputePass();
      c4.setPipeline(computePipelines[3]!);
      c4.setBindGroup(0, intBG);
      c4.dispatchWorkgroups(bodyWG);
      c4.end();
    }

    // Render pass — zero copy, reads pos buffer directly
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
    renderPass.draw(6, activeCount);
    renderPass.end();

    device.queue.submit([encoder.finish()]);

    // Wait for GPU — honest frame timing
    await device.queue.onSubmittedWorkDone();

    const frameEnd = performance.now();
    const totalFrameMs = frameEnd - frameStart;
    frameTimesMs.push(totalFrameMs);

    if (frameTimesMs.length >= 10) {
      const avgMs = frameTimesMs.reduce((a, b) => a + b, 0) / frameTimesMs.length;
      displayFps = avgMs > 0 ? Math.round(1000 / avgMs) : 999;
      frameTimesMs = [];
    }

    // Growth logic
    warmupTimer += frameDt;
    if (!stopped && warmupTimer > WARMUP_MS) {
      growthTimer += frameDt;
      if (growthTimer >= 1000) {
        growthTimer = 0;
        if (displayFps > TARGET_FPS && activeCount < MAX_BODIES) {
          const toAdd = Math.max(32, Math.ceil(activeCount * 0.2));
          const newCount = Math.min(activeCount + toAdd, MAX_BODIES);
          // Re-init new bodies and upload packed data
          for (let i = activeCount; i < newCount; i++) initBody(i);
          activeCount = newCount;
          // Upload the full packed buffers for new bodies
          device.queue.writeBuffer(posBuf, 0, pos.buffer, 0, activeCount * 16);
          device.queue.writeBuffer(velBuf, 0, vel.buffer, 0, activeCount * 16);
          device.queue.writeBuffer(idxBuf, 0, indices.buffer, 0, activeCount * 4);
        } else {
          stopped = true;
          stoppedAt = performance.now();
        }
      }
    }

    // Free resources 5 seconds after growth stops
    if (stopped && stoppedAt > 0 && performance.now() - stoppedAt > 5000) {
      hudEl.innerHTML += `<br><span style="color:#888;">Demo ended — resources freed</span>`;
      device.destroy();
      return;
    }

    const status = stopped
      ? activeCount >= MAX_BODIES
        ? "MAX"
        : `stopped @ ${TARGET_FPS}fps`
      : "growing...";
    hudEl.innerHTML =
      `${activeCount} particles | ${status}<br>` +
      `${displayFps} fps | PACKED vec4f + impulse accum`;

    requestAnimationFrame(frame);
  }

  requestAnimationFrame(frame);
  return () => {
    destroyed = true;
    device.destroy();
  };
}

export const DemoPacked = {
  render: () => {
    const container = document.createElement("div");
    container.style.cssText =
      "width: 100%; height: 600px; background: #111; color: #eee; font-family: monospace; padding: 20px;";
    container.textContent = "Initializing WebGPU (packed vec4f)...";
    setTimeout(() => {
      createPackedDemo(container).catch((e) => {
        container.textContent = `Error: ${e.message}\n\n${e.stack}`;
        container.style.whiteSpace = "pre-wrap";
        container.style.color = "#ef5350";
        console.error("Demo packed error:", e);
      });
    }, 100);
    return container;
  },
};

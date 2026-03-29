/**
 * Storybook demo: Rapier-style GPU physics solver with 20k spheres.
 *
 * Uses the WGSL compute shaders from physics-rapier-gpu.ts and the
 * particle billboard renderer from particle-renderer.ts.
 */
import type { StoryObj } from "@storybook/html";

import {
  GRID_SIZE,
  MAX_PER_CELL,
  TOTAL_CELLS,
  MAX_CONTACTS_PER_BODY,
  NUM_SUB_STEPS,
  clearGridWgsl,
  populateGridWgsl,
  clearContactCountWgsl,
  detectContactsWgsl,
  updateContactDistancesWgsl,
  clearVelDeltaWgsl,
  solveContactsWgsl,
  applyAndIntegrateWgsl,
  applyStabilizationDeltaWgsl,
  DEFAULT_BIASED_SOLVE_PARAMS,
  DEFAULT_STABILIZATION_SOLVE_PARAMS,
} from "../../engine/gpu/systems/physics-rapier-gpu.js";

import {
  particleVertexWgsl,
  particleFragmentWgsl,
} from "../../engine/gpu/render/particle-renderer.js";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const MAX_BODIES = 20_000;
const MAX_CONTACTS = MAX_BODIES * MAX_CONTACTS_PER_BODY;
const BOUNDS = 5;
const SPHERE_RADIUS = 0.12;
const DT = 1 / 60;
const SUB_DT = DT / NUM_SUB_STEPS;
const GRAVITY = -9.81;
const DAMPING = 0.999;
const CELL_SIZE = SPHERE_RADIUS * 4;
const GRID_ORIGIN = -BOUNDS;
const CANVAS_W = 800;
const CANVAS_H = 600;

// ---------------------------------------------------------------------------
// Unpack shader: vec4f pos -> separate px/py/pz for particle renderer
// ---------------------------------------------------------------------------

const unpackPosWgsl = /* wgsl */ `
@group(0) @binding(0) var<storage, read> pos: array<vec4f>;
@group(0) @binding(1) var<storage, read_write> px: array<f32>;
@group(0) @binding(2) var<storage, read_write> py: array<f32>;
@group(0) @binding(3) var<storage, read_write> pz: array<f32>;

@compute @workgroup_size(64)
fn main(@builtin(global_invocation_id) id: vec3u) {
  if (id.x >= arrayLength(&pos)) { return; }
  let p = pos[id.x];
  px[id.x] = p.x;
  py[id.x] = p.y;
  pz[id.x] = p.z;
}
`;

// ---------------------------------------------------------------------------
// View/projection matrix helper (simple perspective looking at origin)
// ---------------------------------------------------------------------------

function mat4Perspective(fov: number, aspect: number, near: number, far: number): Float32Array {
  const f = 1.0 / Math.tan(fov / 2);
  const nf = 1 / (near - far);
  // prettier-ignore
  return new Float32Array([
    f / aspect, 0, 0, 0,
    0, f, 0, 0,
    0, 0, (far + near) * nf, -1,
    0, 0, 2 * far * near * nf, 0,
  ]);
}

function mat4LookAt(eye: [number, number, number], target: [number, number, number], up: [number, number, number]): Float32Array {
  const zx = eye[0] - target[0], zy = eye[1] - target[1], zz = eye[2] - target[2];
  const zl = Math.hypot(zx, zy, zz);
  const zn = [zx / zl, zy / zl, zz / zl];
  const xx = up[1] * zn[2] - up[2] * zn[1];
  const xy = up[2] * zn[0] - up[0] * zn[2];
  const xz = up[0] * zn[1] - up[1] * zn[0];
  const xl = Math.hypot(xx, xy, xz);
  const xn = [xx / xl, xy / xl, xz / xl];
  const yn = [zn[1] * xn[2] - zn[2] * xn[1], zn[2] * xn[0] - zn[0] * xn[2], zn[0] * xn[1] - zn[1] * xn[0]];
  // prettier-ignore
  return new Float32Array([
    xn[0], yn[0], zn[0], 0,
    xn[1], yn[1], zn[1], 0,
    xn[2], yn[2], zn[2], 0,
    -(xn[0]*eye[0]+xn[1]*eye[1]+xn[2]*eye[2]),
    -(yn[0]*eye[0]+yn[1]*eye[1]+yn[2]*eye[2]),
    -(zn[0]*eye[0]+zn[1]*eye[1]+zn[2]*eye[2]),
    1,
  ]);
}

function mat4Multiply(a: Float32Array, b: Float32Array): Float32Array {
  const o = new Float32Array(16);
  for (let i = 0; i < 4; i++)
    for (let j = 0; j < 4; j++)
      o[j * 4 + i] = a[i] * b[j * 4] + a[4 + i] * b[j * 4 + 1] + a[8 + i] * b[j * 4 + 2] + a[12 + i] * b[j * 4 + 3];
  return o;
}

// ---------------------------------------------------------------------------
// Story
// ---------------------------------------------------------------------------

export default {
  title: "Tickets/task-ESE-0020 GPU 3D physics optimizations/Demo Rapier GPU",
};

export const DemoRapierGPU: StoryObj = {
  render: () => {
    const container = document.createElement("div");
    container.style.cssText = "position:relative; width:800px; height:600px; background:#111;";

    const canvas = document.createElement("canvas");
    canvas.width = CANVAS_W;
    canvas.height = CANVAS_H;
    canvas.style.cssText = "width:100%; height:100%;";
    container.appendChild(canvas);

    const hud = document.createElement("div");
    hud.style.cssText = "position:absolute; top:8px; left:8px; color:#0f0; font:bold 14px monospace; text-shadow:0 0 4px #000; pointer-events:none; white-space:pre;";
    container.appendChild(hud);

    // Launch async — Storybook expects sync return of the container
    launchDemo(canvas, hud);
    return container;
  },
};

// ---------------------------------------------------------------------------
// Main async demo
// ---------------------------------------------------------------------------

async function launchDemo(canvas: HTMLCanvasElement, hud: HTMLDivElement) {
  // --- WebGPU init ---
  const adapter = await navigator.gpu?.requestAdapter();
  if (!adapter) {
    hud.textContent = "WebGPU not supported";
    return;
  }
  const device = await adapter.requestDevice({
    requiredLimits: {
      maxStorageBufferBindingSize: 256 * 1024 * 1024,
      maxBufferSize: 256 * 1024 * 1024,
    },
  });
  const ctx = canvas.getContext("webgpu")!;
  const format = navigator.gpu.getPreferredCanvasFormat();
  ctx.configure({ device, format, alphaMode: "opaque" });

  // --- Buffers ---
  const posBuffer = device.createBuffer({ size: MAX_BODIES * 16, usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST | GPUBufferUsage.COPY_SRC });
  const velBuffer = device.createBuffer({ size: MAX_BODIES * 16, usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST });
  const gridBuffer = device.createBuffer({ size: TOTAL_CELLS * MAX_PER_CELL * 4, usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST });
  const indicesBuffer = device.createBuffer({ size: MAX_BODIES * 4, usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST });
  const contactsAbBuffer = device.createBuffer({ size: MAX_CONTACTS * 4, usage: GPUBufferUsage.STORAGE });
  const contactsDataBuffer = device.createBuffer({ size: MAX_CONTACTS * 16, usage: GPUBufferUsage.STORAGE });
  const contactsImpulseBuffer = device.createBuffer({ size: MAX_CONTACTS * 4, usage: GPUBufferUsage.STORAGE });
  const contactCountBuffer = device.createBuffer({ size: 4, usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST | GPUBufferUsage.COPY_SRC });
  const velDeltaXBuffer = device.createBuffer({ size: MAX_BODIES * 4, usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST });
  const velDeltaYBuffer = device.createBuffer({ size: MAX_BODIES * 4, usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST });
  const velDeltaZBuffer = device.createBuffer({ size: MAX_BODIES * 4, usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST });

  // Separate px/py/pz for the particle renderer
  const pxBuffer = device.createBuffer({ size: MAX_BODIES * 4, usage: GPUBufferUsage.STORAGE });
  const pyBuffer = device.createBuffer({ size: MAX_BODIES * 4, usage: GPUBufferUsage.STORAGE });
  const pzBuffer = device.createBuffer({ size: MAX_BODIES * 4, usage: GPUBufferUsage.STORAGE });

  // Readback buffer for contact count
  const contactCountReadback = device.createBuffer({ size: 4, usage: GPUBufferUsage.MAP_READ | GPUBufferUsage.COPY_DST });

  // --- Uniform buffers ---
  // clearGrid params: { totalCells: u32 }  (padded to 4 bytes is fine)
  const clearGridParamsBuffer = device.createBuffer({ size: 4, usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST });
  device.queue.writeBuffer(clearGridParamsBuffer, 0, new Uint32Array([TOTAL_CELLS]));

  // populateGrid params: { gridSize: u32, cellSize: f32, gridOrigin: f32 }
  const populateGridParamsBuffer = device.createBuffer({ size: 12, usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST });
  {
    const buf = new ArrayBuffer(12);
    new Uint32Array(buf, 0, 1)[0] = GRID_SIZE;
    new Float32Array(buf, 4, 1)[0] = CELL_SIZE;
    new Float32Array(buf, 8, 1)[0] = GRID_ORIGIN;
    device.queue.writeBuffer(populateGridParamsBuffer, 0, new Uint8Array(buf));
  }

  // detectContacts gridParams: same as populateGrid
  const detectGridParamsBuffer = device.createBuffer({ size: 12, usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST });
  {
    const buf = new ArrayBuffer(12);
    new Uint32Array(buf, 0, 1)[0] = GRID_SIZE;
    new Float32Array(buf, 4, 1)[0] = CELL_SIZE;
    new Float32Array(buf, 8, 1)[0] = GRID_ORIGIN;
    device.queue.writeBuffer(detectGridParamsBuffer, 0, new Uint8Array(buf));
  }

  // detectContacts contactParams: { maxContacts: u32 }
  const contactParamsBuffer = device.createBuffer({ size: 4, usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST });
  device.queue.writeBuffer(contactParamsBuffer, 0, new Uint32Array([MAX_CONTACTS]));

  // updateContactDistances numContacts uniform — will be written each frame
  const numContactsUniformBuffer = device.createBuffer({ size: 4, usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST });

  // solveContacts biased params
  const biasedSolveParamsBuffer = device.createBuffer({ size: 16, usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST });
  device.queue.writeBuffer(biasedSolveParamsBuffer, 0, new Float32Array([
    DEFAULT_BIASED_SOLVE_PARAMS.erp_inv_dt,
    DEFAULT_BIASED_SOLVE_PARAMS.cfm,
    DEFAULT_BIASED_SOLVE_PARAMS.allowed_err,
    DEFAULT_BIASED_SOLVE_PARAMS.max_bias,
  ]));

  // solveContacts stabilization params
  const stabSolveParamsBuffer = device.createBuffer({ size: 16, usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST });
  device.queue.writeBuffer(stabSolveParamsBuffer, 0, new Float32Array([
    DEFAULT_STABILIZATION_SOLVE_PARAMS.erp_inv_dt,
    DEFAULT_STABILIZATION_SOLVE_PARAMS.cfm,
    DEFAULT_STABILIZATION_SOLVE_PARAMS.allowed_err,
    DEFAULT_STABILIZATION_SOLVE_PARAMS.max_bias,
  ]));

  // numContacts uniform for solve passes (shared with updateContactDistances)
  const solveNumContactsBuffer = numContactsUniformBuffer; // reuse

  // applyAndIntegrate params: { sub_dt, gravity, damping, boundsMin, boundsMax }
  const integrateParamsBuffer = device.createBuffer({ size: 20, usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST });
  device.queue.writeBuffer(integrateParamsBuffer, 0, new Float32Array([SUB_DT, GRAVITY, DAMPING, -BOUNDS, BOUNDS]));

  // Camera uniform for particle renderer
  const aspect = CANVAS_W / CANVAS_H;
  const proj = mat4Perspective(Math.PI / 4, aspect, 0.1, 100);
  const view = mat4LookAt([0, 4, 14], [0, 0, 0], [0, 1, 0]);
  const viewProj = mat4Multiply(proj, view);
  // Camera struct: mat4x4f (64 bytes) + screenHeight (f32) + particleRadius (f32) + aspectRatio (f32) + padding
  const cameraBuffer = device.createBuffer({ size: 80, usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST });
  {
    const data = new Float32Array(20);
    data.set(viewProj, 0);
    data[16] = CANVAS_H;
    data[17] = SPHERE_RADIUS;
    data[18] = aspect;
    device.queue.writeBuffer(cameraBuffer, 0, data);
  }

  // Depth texture for rendering
  const depthTexture = device.createTexture({
    size: [CANVAS_W, CANVAS_H],
    format: "depth24plus",
    usage: GPUTextureUsage.RENDER_ATTACHMENT,
  });

  // --- Compute pipelines ---
  function makePipeline(code: string, label: string): GPUComputePipeline {
    return device.createComputePipeline({
      layout: "auto",
      compute: { module: device.createShaderModule({ code }), entryPoint: "main" },
      label,
    });
  }

  const clearGridPipeline = makePipeline(clearGridWgsl, "clearGrid");
  const populateGridPipeline = makePipeline(populateGridWgsl, "populateGrid");
  const clearContactCountPipeline = makePipeline(clearContactCountWgsl, "clearContactCount");
  const detectContactsPipeline = makePipeline(detectContactsWgsl, "detectContacts");
  const updateContactDistancesPipeline = makePipeline(updateContactDistancesWgsl, "updateContactDistances");
  const clearVelDeltaPipeline = makePipeline(clearVelDeltaWgsl, "clearVelDelta");
  const solveContactsPipeline = makePipeline(solveContactsWgsl, "solveContacts");
  const applyAndIntegratePipeline = makePipeline(applyAndIntegrateWgsl, "applyAndIntegrate");
  const applyStabDeltaPipeline = makePipeline(applyStabilizationDeltaWgsl, "applyStabilizationDelta");
  const unpackPosPipeline = makePipeline(unpackPosWgsl, "unpackPos");

  // --- Bind groups ---

  // clearGrid: @binding(0) params uniform, @binding(1) grid storage
  const clearGridBG = device.createBindGroup({
    layout: clearGridPipeline.getBindGroupLayout(0),
    entries: [
      { binding: 0, resource: { buffer: clearGridParamsBuffer } },
      { binding: 1, resource: { buffer: gridBuffer } },
    ],
  });

  // populateGrid: @binding(0) params, @binding(1) grid(atomic), @binding(2) indices, @binding(3) pos
  const populateGridBG = device.createBindGroup({
    layout: populateGridPipeline.getBindGroupLayout(0),
    entries: [
      { binding: 0, resource: { buffer: populateGridParamsBuffer } },
      { binding: 1, resource: { buffer: gridBuffer } },
      { binding: 2, resource: { buffer: indicesBuffer } },
      { binding: 3, resource: { buffer: posBuffer } },
    ],
  });

  // clearContactCount: @binding(0) contact_count
  const clearContactCountBG = device.createBindGroup({
    layout: clearContactCountPipeline.getBindGroupLayout(0),
    entries: [
      { binding: 0, resource: { buffer: contactCountBuffer } },
    ],
  });

  // detectContacts: @binding(0) gridParams, @binding(1) contactParams,
  //   @binding(2) grid, @binding(3) indices, @binding(4) pos,
  //   @binding(5) contacts_ab, @binding(6) contacts_data,
  //   @binding(7) contacts_impulse, @binding(8) contact_count
  const detectContactsBG = device.createBindGroup({
    layout: detectContactsPipeline.getBindGroupLayout(0),
    entries: [
      { binding: 0, resource: { buffer: detectGridParamsBuffer } },
      { binding: 1, resource: { buffer: contactParamsBuffer } },
      { binding: 2, resource: { buffer: gridBuffer } },
      { binding: 3, resource: { buffer: indicesBuffer } },
      { binding: 4, resource: { buffer: posBuffer } },
      { binding: 5, resource: { buffer: contactsAbBuffer } },
      { binding: 6, resource: { buffer: contactsDataBuffer } },
      { binding: 7, resource: { buffer: contactsImpulseBuffer } },
      { binding: 8, resource: { buffer: contactCountBuffer } },
    ],
  });

  // updateContactDistances: @binding(0) pos, @binding(1) contacts_ab,
  //   @binding(2) contacts_data, @binding(3) numContacts uniform
  const updateContactDistancesBG = device.createBindGroup({
    layout: updateContactDistancesPipeline.getBindGroupLayout(0),
    entries: [
      { binding: 0, resource: { buffer: posBuffer } },
      { binding: 1, resource: { buffer: contactsAbBuffer } },
      { binding: 2, resource: { buffer: contactsDataBuffer } },
      { binding: 3, resource: { buffer: numContactsUniformBuffer } },
    ],
  });

  // clearVelDelta: @binding(0) indices, @binding(1-3) vel_delta_x/y/z
  const clearVelDeltaBG = device.createBindGroup({
    layout: clearVelDeltaPipeline.getBindGroupLayout(0),
    entries: [
      { binding: 0, resource: { buffer: indicesBuffer } },
      { binding: 1, resource: { buffer: velDeltaXBuffer } },
      { binding: 2, resource: { buffer: velDeltaYBuffer } },
      { binding: 3, resource: { buffer: velDeltaZBuffer } },
    ],
  });

  // solveContacts (biased): @binding(0) solveParams, @binding(1) numContacts,
  //   @binding(2) vel, @binding(3) contacts_ab, @binding(4) contacts_data,
  //   @binding(5) contacts_impulse, @binding(6-8) vel_delta_x/y/z
  const solveContactsBiasedBG = device.createBindGroup({
    layout: solveContactsPipeline.getBindGroupLayout(0),
    entries: [
      { binding: 0, resource: { buffer: biasedSolveParamsBuffer } },
      { binding: 1, resource: { buffer: solveNumContactsBuffer } },
      { binding: 2, resource: { buffer: velBuffer } },
      { binding: 3, resource: { buffer: contactsAbBuffer } },
      { binding: 4, resource: { buffer: contactsDataBuffer } },
      { binding: 5, resource: { buffer: contactsImpulseBuffer } },
      { binding: 6, resource: { buffer: velDeltaXBuffer } },
      { binding: 7, resource: { buffer: velDeltaYBuffer } },
      { binding: 8, resource: { buffer: velDeltaZBuffer } },
    ],
  });

  // solveContacts (stabilization): same layout, different params buffer
  const solveContactsStabBG = device.createBindGroup({
    layout: solveContactsPipeline.getBindGroupLayout(0),
    entries: [
      { binding: 0, resource: { buffer: stabSolveParamsBuffer } },
      { binding: 1, resource: { buffer: solveNumContactsBuffer } },
      { binding: 2, resource: { buffer: velBuffer } },
      { binding: 3, resource: { buffer: contactsAbBuffer } },
      { binding: 4, resource: { buffer: contactsDataBuffer } },
      { binding: 5, resource: { buffer: contactsImpulseBuffer } },
      { binding: 6, resource: { buffer: velDeltaXBuffer } },
      { binding: 7, resource: { buffer: velDeltaYBuffer } },
      { binding: 8, resource: { buffer: velDeltaZBuffer } },
    ],
  });

  // applyAndIntegrate: @binding(0) params, @binding(1) indices,
  //   @binding(2) pos, @binding(3) vel,
  //   @binding(4-6) vel_delta_x/y/z
  const applyAndIntegrateBG = device.createBindGroup({
    layout: applyAndIntegratePipeline.getBindGroupLayout(0),
    entries: [
      { binding: 0, resource: { buffer: integrateParamsBuffer } },
      { binding: 1, resource: { buffer: indicesBuffer } },
      { binding: 2, resource: { buffer: posBuffer } },
      { binding: 3, resource: { buffer: velBuffer } },
      { binding: 4, resource: { buffer: velDeltaXBuffer } },
      { binding: 5, resource: { buffer: velDeltaYBuffer } },
      { binding: 6, resource: { buffer: velDeltaZBuffer } },
    ],
  });

  // applyStabilizationDelta: @binding(0) indices, @binding(1) vel,
  //   @binding(2-4) vel_delta_x/y/z
  const applyStabDeltaBG = device.createBindGroup({
    layout: applyStabDeltaPipeline.getBindGroupLayout(0),
    entries: [
      { binding: 0, resource: { buffer: indicesBuffer } },
      { binding: 1, resource: { buffer: velBuffer } },
      { binding: 2, resource: { buffer: velDeltaXBuffer } },
      { binding: 3, resource: { buffer: velDeltaYBuffer } },
      { binding: 4, resource: { buffer: velDeltaZBuffer } },
    ],
  });

  // unpackPos: @binding(0) pos, @binding(1-3) px/py/pz
  const unpackPosBG = device.createBindGroup({
    layout: unpackPosPipeline.getBindGroupLayout(0),
    entries: [
      { binding: 0, resource: { buffer: posBuffer } },
      { binding: 1, resource: { buffer: pxBuffer } },
      { binding: 2, resource: { buffer: pyBuffer } },
      { binding: 3, resource: { buffer: pzBuffer } },
    ],
  });

  // --- Render pipeline (particle billboard) ---
  const renderPipeline = device.createRenderPipeline({
    layout: "auto",
    vertex: {
      module: device.createShaderModule({ code: particleVertexWgsl }),
      entryPoint: "main",
    },
    fragment: {
      module: device.createShaderModule({ code: particleFragmentWgsl }),
      entryPoint: "main",
      targets: [{ format }],
    },
    primitive: { topology: "triangle-list" },
    depthStencil: {
      format: "depth24plus",
      depthWriteEnabled: true,
      depthCompare: "less",
    },
  });

  const renderBG = device.createBindGroup({
    layout: renderPipeline.getBindGroupLayout(0),
    entries: [
      { binding: 0, resource: { buffer: cameraBuffer } },
      { binding: 1, resource: { buffer: pxBuffer } },
      { binding: 2, resource: { buffer: pyBuffer } },
      { binding: 3, resource: { buffer: pzBuffer } },
    ],
  });

  // --- Initialize bodies ---
  let numBodies = 64;

  function initBodies(start: number, count: number) {
    const posData = new Float32Array(count * 4);
    const velData = new Float32Array(count * 4);
    for (let i = 0; i < count; i++) {
      // Random position within bounds
      const x = (Math.random() - 0.5) * BOUNDS * 1.6;
      const y = Math.random() * BOUNDS * 1.5 + SPHERE_RADIUS;
      const z = (Math.random() - 0.5) * BOUNDS * 1.6;
      posData[i * 4 + 0] = x;
      posData[i * 4 + 1] = y;
      posData[i * 4 + 2] = z;
      posData[i * 4 + 3] = SPHERE_RADIUS;

      // Small random initial velocity
      velData[i * 4 + 0] = (Math.random() - 0.5) * 0.5;
      velData[i * 4 + 1] = (Math.random() - 0.5) * 0.5;
      velData[i * 4 + 2] = (Math.random() - 0.5) * 0.5;
      velData[i * 4 + 3] = 0.3; // restitution
    }
    device.queue.writeBuffer(posBuffer, start * 16, posData);
    device.queue.writeBuffer(velBuffer, start * 16, velData);
  }

  function uploadIndices(count: number) {
    const indices = new Uint32Array(count);
    for (let i = 0; i < count; i++) indices[i] = i;
    device.queue.writeBuffer(indicesBuffer, 0, indices);
  }

  initBodies(0, numBodies);
  uploadIndices(numBodies);

  // --- Frame loop state ---
  let running = true;
  let frameCount = 0;
  let lastTime = performance.now();
  let fps = 60;
  const startTime = performance.now();
  let growthStarted = false;
  let growthStopped = false;
  let growthStopTime = 0;
  let lastGrowthTime = 0;

  async function frame() {
    if (!running) return;

    const now = performance.now();
    const elapsed = (now - startTime) / 1000;

    // --- Growth logic ---
    if (!growthStarted && elapsed > 3) {
      growthStarted = true;
      lastGrowthTime = now;
    }

    if (growthStarted && !growthStopped) {
      const growthElapsed = (now - lastGrowthTime) / 1000;
      if (growthElapsed >= 1.0) {
        // Grow 20% per second
        const newCount = Math.min(MAX_BODIES, Math.ceil(numBodies * 1.2));
        if (newCount > numBodies) {
          const added = newCount - numBodies;
          initBodies(numBodies, added);
          numBodies = newCount;
          uploadIndices(numBodies);
        }
        lastGrowthTime = now;

        if (numBodies >= MAX_BODIES || fps < 40) {
          growthStopped = true;
          growthStopTime = now;
        }
      }
    }

    // --- Stop and free after 5s post-growth ---
    if (growthStopped && (now - growthStopTime) / 1000 > 5) {
      running = false;
      hud.textContent += "\n[STOPPED]";
      // Free GPU resources
      posBuffer.destroy();
      velBuffer.destroy();
      gridBuffer.destroy();
      indicesBuffer.destroy();
      contactsAbBuffer.destroy();
      contactsDataBuffer.destroy();
      contactsImpulseBuffer.destroy();
      contactCountBuffer.destroy();
      contactCountReadback.destroy();
      velDeltaXBuffer.destroy();
      velDeltaYBuffer.destroy();
      velDeltaZBuffer.destroy();
      pxBuffer.destroy();
      pyBuffer.destroy();
      pzBuffer.destroy();
      depthTexture.destroy();
      device.destroy();
      return;
    }

    const bodyGroups = Math.ceil(numBodies / 64);
    const gridGroups = Math.ceil(TOTAL_CELLS / 64);

    // --- Build command encoder with all physics passes ---
    const encoder = device.createCommandEncoder();

    // Pass 1: Clear grid
    {
      const pass = encoder.beginComputePass();
      pass.setPipeline(clearGridPipeline);
      pass.setBindGroup(0, clearGridBG);
      pass.dispatchWorkgroups(gridGroups);
      pass.end();
    }

    // Pass 2: Populate grid
    {
      const pass = encoder.beginComputePass();
      pass.setPipeline(populateGridPipeline);
      pass.setBindGroup(0, populateGridBG);
      pass.dispatchWorkgroups(bodyGroups);
      pass.end();
    }

    // Pass 3: Clear contact count
    {
      const pass = encoder.beginComputePass();
      pass.setPipeline(clearContactCountPipeline);
      pass.setBindGroup(0, clearContactCountBG);
      pass.dispatchWorkgroups(1);
      pass.end();
    }

    // Pass 3b: Detect contacts
    {
      const pass = encoder.beginComputePass();
      pass.setPipeline(detectContactsPipeline);
      pass.setBindGroup(0, detectContactsBG);
      pass.dispatchWorkgroups(bodyGroups);
      pass.end();
    }

    // Copy contact count for readback
    encoder.copyBufferToBuffer(contactCountBuffer, 0, contactCountReadback, 0, 4);

    device.queue.submit([encoder.finish()]);

    // Read back contact count
    await contactCountReadback.mapAsync(GPUMapMode.READ);
    const countArray = new Uint32Array(contactCountReadback.getMappedRange());
    const numContacts = Math.min(countArray[0], MAX_CONTACTS);
    contactCountReadback.unmap();

    // Write numContacts to uniform
    device.queue.writeBuffer(numContactsUniformBuffer, 0, new Uint32Array([numContacts]));

    const contactGroups = Math.ceil(Math.max(1, numContacts) / 64);

    // --- Sub-step loop ---
    const subEncoder = device.createCommandEncoder();

    for (let step = 0; step < NUM_SUB_STEPS; step++) {
      // 4a: Update contact distances
      {
        const pass = subEncoder.beginComputePass();
        pass.setPipeline(updateContactDistancesPipeline);
        pass.setBindGroup(0, updateContactDistancesBG);
        pass.dispatchWorkgroups(contactGroups);
        pass.end();
      }

      // 4b: Clear vel deltas
      {
        const pass = subEncoder.beginComputePass();
        pass.setPipeline(clearVelDeltaPipeline);
        pass.setBindGroup(0, clearVelDeltaBG);
        pass.dispatchWorkgroups(bodyGroups);
        pass.end();
      }

      // 4b: Solve contacts (biased)
      {
        const pass = subEncoder.beginComputePass();
        pass.setPipeline(solveContactsPipeline);
        pass.setBindGroup(0, solveContactsBiasedBG);
        pass.dispatchWorkgroups(contactGroups);
        pass.end();
      }

      // 4c: Apply deltas + gravity + integrate
      {
        const pass = subEncoder.beginComputePass();
        pass.setPipeline(applyAndIntegratePipeline);
        pass.setBindGroup(0, applyAndIntegrateBG);
        pass.dispatchWorkgroups(bodyGroups);
        pass.end();
      }

      // 4d: Clear vel deltas for stabilization
      {
        const pass = subEncoder.beginComputePass();
        pass.setPipeline(clearVelDeltaPipeline);
        pass.setBindGroup(0, clearVelDeltaBG);
        pass.dispatchWorkgroups(bodyGroups);
        pass.end();
      }

      // 4d: Solve contacts (stabilization)
      {
        const pass = subEncoder.beginComputePass();
        pass.setPipeline(solveContactsPipeline);
        pass.setBindGroup(0, solveContactsStabBG);
        pass.dispatchWorkgroups(contactGroups);
        pass.end();
      }

      // 4d: Apply stabilization deltas
      {
        const pass = subEncoder.beginComputePass();
        pass.setPipeline(applyStabDeltaPipeline);
        pass.setBindGroup(0, applyStabDeltaBG);
        pass.dispatchWorkgroups(bodyGroups);
        pass.end();
      }
    }

    // Unpack pos -> px/py/pz for renderer
    {
      const pass = subEncoder.beginComputePass();
      pass.setPipeline(unpackPosPipeline);
      pass.setBindGroup(0, unpackPosBG);
      pass.dispatchWorkgroups(Math.ceil(MAX_BODIES / 64));
      pass.end();
    }

    // --- Render pass ---
    {
      const pass = subEncoder.beginRenderPass({
        colorAttachments: [{
          view: ctx.getCurrentTexture().createView(),
          loadOp: "clear" as GPULoadOp,
          storeOp: "store" as GPUStoreOp,
          clearValue: { r: 0.06, g: 0.06, b: 0.08, a: 1 },
        }],
        depthStencilAttachment: {
          view: depthTexture.createView(),
          depthLoadOp: "clear" as GPULoadOp,
          depthStoreOp: "store" as GPUStoreOp,
          depthClearValue: 1.0,
        },
      });
      pass.setPipeline(renderPipeline);
      pass.setBindGroup(0, renderBG);
      pass.draw(6, numBodies); // 6 vertices per billboard quad, N instances
      pass.end();
    }

    device.queue.submit([subEncoder.finish()]);
    await device.queue.onSubmittedWorkDone();

    // --- FPS tracking ---
    frameCount++;
    const dt = now - lastTime;
    if (dt > 0) {
      fps = fps * 0.9 + (1000 / dt) * 0.1; // smoothed
    }
    lastTime = now;

    // --- HUD ---
    hud.textContent =
      `RAPIER-GPU solver\n` +
      `Bodies: ${numBodies.toLocaleString()}\n` +
      `FPS:    ${Math.round(fps)}\n` +
      `Contacts: ${numContacts.toLocaleString()}`;

    requestAnimationFrame(frame);
  }

  requestAnimationFrame(frame);
}

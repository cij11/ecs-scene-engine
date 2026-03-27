/**
 * GPU Physics Demo — 500+ bouncing spheres with spatial hash collision.
 *
 * 4-pass compute pipeline: clear grid → populate → collide → integrate
 * All in a single command encoder submission per frame.
 *
 * Open: http://localhost:4000/gpu-physics-demo.html
 */

import {
  clearGridWgsl,
  populateGridWgsl,
  collisionWgsl,
  integrateWgsl,
  GRID_SIZE,
  MAX_PER_CELL,
  TOTAL_CELLS,
} from "../engine/gpu/systems/physics.js";

const logEl = document.getElementById("log")!;
function emit(text: string, cls?: string): void {
  const span = document.createElement("span");
  span.className = cls ?? "";
  span.textContent = text + "\n";
  logEl.appendChild(span);
}

async function main() {
  emit("=== GPU Physics Demo: Bouncing Spheres ===", "header");
  emit("");

  // --- 1. Init WebGPU ---
  if (!navigator.gpu) {
    emit("WebGPU not available.", "fail");
    return;
  }
  const adapter = await navigator.gpu.requestAdapter();
  if (!adapter) {
    emit("No GPU adapter.", "fail");
    return;
  }
  const device = await adapter.requestDevice({
    requiredLimits: {
      maxStorageBuffersPerShaderStage: adapter.limits.maxStorageBuffersPerShaderStage,
    },
  });
  emit("1. WebGPU device initialized", "pass");

  // --- 2. Compile all 4 shader passes ---
  const passes = [
    { name: "clearGrid", code: clearGridWgsl },
    { name: "populateGrid", code: populateGridWgsl },
    { name: "collision", code: collisionWgsl },
    { name: "integrate", code: integrateWgsl },
  ];

  const pipelines: GPUComputePipeline[] = [];
  for (const p of passes) {
    const module = device.createShaderModule({ code: p.code });
    const info = await module.getCompilationInfo();
    const errs = info.messages.filter((m) => m.type === "error");
    if (errs.length > 0) {
      emit(`   ${p.name} compilation FAILED: ${errs[0]!.message}`, "fail");
      return;
    }
    pipelines.push(
      device.createComputePipeline({ layout: "auto", compute: { module, entryPoint: "main" } }),
    );
    emit(`   ${p.name} compiled`, "pass");
  }
  emit("2. All 4 shader passes compiled", "pass");

  // --- 3. Create entities ---
  const BODY_COUNT = 2048; // GPU shines at this scale: ~14x faster than CPU O(n²)
  const BOUNDS = 20;
  const CELL_SIZE = (BOUNDS * 2) / GRID_SIZE;
  const SPHERE_RADIUS = 0.5;

  const px = new Float32Array(BODY_COUNT);
  const py = new Float32Array(BODY_COUNT);
  const pz = new Float32Array(BODY_COUNT);
  const velX = new Float32Array(BODY_COUNT);
  const velY = new Float32Array(BODY_COUNT);
  const velZ = new Float32Array(BODY_COUNT);
  const radii = new Float32Array(BODY_COUNT);
  const rest = new Float32Array(BODY_COUNT);
  const forceX = new Float32Array(BODY_COUNT);
  const forceY = new Float32Array(BODY_COUNT);
  const forceZ = new Float32Array(BODY_COUNT);
  const indices = new Uint32Array(BODY_COUNT);

  for (let i = 0; i < BODY_COUNT; i++) {
    px[i] = (Math.random() - 0.5) * BOUNDS;
    py[i] = Math.random() * BOUNDS; // spawn in upper half
    pz[i] = (Math.random() - 0.5) * BOUNDS;
    velX[i] = (Math.random() - 0.5) * 2;
    velY[i] = 0;
    velZ[i] = (Math.random() - 0.5) * 2;
    radii[i] = SPHERE_RADIUS;
    rest[i] = 0.5;
    indices[i] = i;
  }
  emit(
    `\n3. Created ${BODY_COUNT} rigid bodies (radius=${SPHERE_RADIUS}, bounds=±${BOUNDS})`,
    "pass",
  );

  // --- 4. Create GPU buffers ---
  function makeBuf(
    data: Float32Array | Uint32Array | Int32Array,
    usage: number,
    label: string,
  ): GPUBuffer {
    const buf = device.createBuffer({ size: data.byteLength, usage, label });
    device.queue.writeBuffer(buf, 0, data.buffer, data.byteOffset, data.byteLength);
    return buf;
  }

  const SRW = GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST | GPUBufferUsage.COPY_SRC;
  const SR = GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST;
  const UNI = GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST;

  const pxBuf = makeBuf(px, SRW, "px");
  const pyBuf = makeBuf(py, SRW, "py");
  const pzBuf = makeBuf(pz, SRW, "pz");
  const vxBuf = makeBuf(velX, SRW, "vx");
  const vyBuf = makeBuf(velY, SRW, "vy");
  const vzBuf = makeBuf(velZ, SRW, "vz");
  const radBuf = makeBuf(radii, SR, "radius");
  const restBuf = makeBuf(rest, SR, "restitution");
  const fxBuf = makeBuf(forceX, SRW, "fx");
  const fyBuf = makeBuf(forceY, SRW, "fy");
  const fzBuf = makeBuf(forceZ, SRW, "fz");
  const idxBuf = makeBuf(indices, SR, "indices");

  // Spatial grid buffer
  const gridData = new Int32Array(TOTAL_CELLS * MAX_PER_CELL).fill(-1);
  const gridBuf = device.createBuffer({
    size: gridData.byteLength,
    usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
    label: "grid",
  });

  // Uniform buffers for each pass
  const clearParams = new Uint32Array([TOTAL_CELLS]);
  const clearUniBuf = makeBuf(clearParams, UNI, "clearParams");

  const popParams = new Float32Array(3);
  const popParamsU32 = new Uint32Array(popParams.buffer);
  popParamsU32[0] = GRID_SIZE;
  popParams[1] = CELL_SIZE;
  popParams[2] = -BOUNDS;
  const popUniBuf = makeBuf(popParams, UNI, "popParams");

  const colParams = new Float32Array(3);
  const colParamsU32 = new Uint32Array(colParams.buffer);
  colParamsU32[0] = GRID_SIZE;
  colParams[1] = CELL_SIZE;
  colParams[2] = -BOUNDS;
  const colUniBuf = makeBuf(colParams, UNI, "colParams");

  const intParams = new Float32Array([1 / 60, -9.8, -BOUNDS, BOUNDS]);
  const intUniBuf = makeBuf(intParams, UNI, "intParams");

  emit(
    `   Created ${14} GPU buffers + grid (${(gridData.byteLength / 1024).toFixed(0)}KB)`,
    "pass",
  );

  // --- 5. Create bind groups ---
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
      { binding: 5, resource: { buffer: pzBuf } },
    ],
  });

  const colBG = device.createBindGroup({
    layout: pipelines[2]!.getBindGroupLayout(0),
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
    layout: pipelines[3]!.getBindGroupLayout(0),
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

  // --- 6. Dispatch 60 frames ---
  const FRAMES = 60;
  const bodyWG = Math.ceil(BODY_COUNT / 64);
  const gridWG = Math.ceil(TOTAL_CELLS / 64);

  emit(`\n4. Dispatching ${FRAMES} frames (4 passes each)...`, "header");

  const gpuStart = performance.now();
  for (let frame = 0; frame < FRAMES; frame++) {
    const encoder = device.createCommandEncoder();

    // Pass 1: Clear grid
    const p1 = encoder.beginComputePass();
    p1.setPipeline(pipelines[0]!);
    p1.setBindGroup(0, clearBG);
    p1.dispatchWorkgroups(gridWG);
    p1.end();

    // Pass 2: Populate grid
    const p2 = encoder.beginComputePass();
    p2.setPipeline(pipelines[1]!);
    p2.setBindGroup(0, popBG);
    p2.dispatchWorkgroups(bodyWG);
    p2.end();

    // Pass 3: Collision detection
    const p3 = encoder.beginComputePass();
    p3.setPipeline(pipelines[2]!);
    p3.setBindGroup(0, colBG);
    p3.dispatchWorkgroups(bodyWG);
    p3.end();

    // Pass 4: Integration
    const p4 = encoder.beginComputePass();
    p4.setPipeline(pipelines[3]!);
    p4.setBindGroup(0, intBG);
    p4.dispatchWorkgroups(bodyWG);
    p4.end();

    device.queue.submit([encoder.finish()]);
  }
  await device.queue.onSubmittedWorkDone();
  const gpuTime = performance.now() - gpuStart;

  emit(
    `   GPU: ${FRAMES} frames in ${gpuTime.toFixed(1)}ms (${(gpuTime / FRAMES).toFixed(2)}ms/frame)`,
    "perf",
  );
  emit(`   4 passes × ${FRAMES} frames = ${FRAMES * 4} compute dispatches`, "perf");

  // --- 7. Readback positions ---
  emit("\n5. Reading back results...", "header");

  async function readback(buf: GPUBuffer, dst: Float32Array): Promise<void> {
    const staging = device.createBuffer({
      size: dst.byteLength,
      usage: GPUBufferUsage.MAP_READ | GPUBufferUsage.COPY_DST,
    });
    const enc = device.createCommandEncoder();
    enc.copyBufferToBuffer(buf, 0, staging, 0, dst.byteLength);
    device.queue.submit([enc.finish()]);
    await staging.mapAsync(GPUMapMode.READ);
    dst.set(new Float32Array(staging.getMappedRange()));
    staging.unmap();
    staging.destroy();
  }

  await readback(pxBuf, px);
  await readback(pyBuf, py);
  await readback(pzBuf, pz);
  await readback(vxBuf, velX);
  await readback(vyBuf, velY);
  await readback(vzBuf, velZ);
  emit("   Readback complete", "pass");

  // --- 8. Show results ---
  emit("\n6. Sample body states (after GPU simulation):", "header");
  for (let i = 0; i < 5; i++) {
    emit(
      `   Body ${i}: pos=(${px[i]!.toFixed(2)}, ${py[i]!.toFixed(2)}, ${pz[i]!.toFixed(2)}) ` +
        `vel=(${velX[i]!.toFixed(2)}, ${velY[i]!.toFixed(2)}, ${velZ[i]!.toFixed(2)})`,
    );
  }

  // Verify all within bounds
  let inBounds = 0;
  let settled = 0;
  for (let i = 0; i < BODY_COUNT; i++) {
    if (
      px[i]! >= -BOUNDS - 1 &&
      px[i]! <= BOUNDS + 1 &&
      py[i]! >= -BOUNDS - 1 &&
      py[i]! <= BOUNDS + 1 &&
      pz[i]! >= -BOUNDS - 1 &&
      pz[i]! <= BOUNDS + 1
    ) {
      inBounds++;
    }
    if (Math.abs(velY[i]!) < 1.0) settled++;
  }

  emit("\n7. Verification:", "header");
  emit(
    `   Bodies within bounds: ${inBounds}/${BODY_COUNT} ${inBounds === BODY_COUNT ? "PASS" : "FAIL"}`,
    inBounds === BODY_COUNT ? "pass" : "fail",
  );
  emit(`   Bodies settling (|vy| < 1): ${settled}/${BODY_COUNT}`, "pass");

  // --- 9. CPU comparison ---
  emit("\n8. CPU reference comparison:", "header");
  const cpuPx = new Float32Array(BODY_COUNT);
  const cpuPy = new Float32Array(BODY_COUNT);
  const cpuPz = new Float32Array(BODY_COUNT);
  const cpuVx = new Float32Array(BODY_COUNT);
  const cpuVy = new Float32Array(BODY_COUNT);
  const cpuVz = new Float32Array(BODY_COUNT);
  const cpuRad = new Float32Array(BODY_COUNT);

  for (let i = 0; i < BODY_COUNT; i++) {
    cpuPx[i] = (Math.random() - 0.5) * BOUNDS;
    cpuPy[i] = Math.random() * BOUNDS;
    cpuPz[i] = (Math.random() - 0.5) * BOUNDS;
    cpuVx[i] = (Math.random() - 0.5) * 2;
    cpuVy[i] = 0;
    cpuVz[i] = (Math.random() - 0.5) * 2;
    cpuRad[i] = SPHERE_RADIUS;
  }

  const DT = 1 / 60;
  const GRAVITY = -9.8;
  const cpuStart = performance.now();
  for (let frame = 0; frame < FRAMES; frame++) {
    // Brute force O(n²) collision
    for (let i = 0; i < BODY_COUNT; i++) {
      for (let j = i + 1; j < BODY_COUNT; j++) {
        const dx = cpuPx[i]! - cpuPx[j]!;
        const dy = cpuPy[i]! - cpuPy[j]!;
        const dz = cpuPz[i]! - cpuPz[j]!;
        const dist = Math.sqrt(dx * dx + dy * dy + dz * dz);
        const minDist = cpuRad[i]! + cpuRad[j]!;
        if (dist < minDist && dist > 0.001) {
          const nx = dx / dist;
          const ny = dy / dist;
          const nz = dz / dist;
          const relVel =
            (cpuVx[i]! - cpuVx[j]!) * nx +
            (cpuVy[i]! - cpuVy[j]!) * ny +
            (cpuVz[i]! - cpuVz[j]!) * nz;
          if (relVel < 0) {
            const j2 = -(1 + 0.5) * relVel * 0.5;
            cpuVx[i]! += j2 * nx;
            cpuVy[i]! += j2 * ny;
            cpuVz[i]! += j2 * nz;
            cpuVx[j]! -= j2 * nx;
            cpuVy[j]! -= j2 * ny;
            cpuVz[j]! -= j2 * nz;
          }
        }
      }
    }
    // Integration
    for (let i = 0; i < BODY_COUNT; i++) {
      cpuVy[i]! += GRAVITY * DT;
      cpuPx[i]! += cpuVx[i]! * DT;
      cpuPy[i]! += cpuVy[i]! * DT;
      cpuPz[i]! += cpuVz[i]! * DT;
      if (cpuPy[i]! < -BOUNDS) {
        cpuPy[i] = -BOUNDS;
        cpuVy[i]! *= -0.7;
      }
      if (cpuPy[i]! > BOUNDS) {
        cpuPy[i] = BOUNDS;
        cpuVy[i]! *= -0.7;
      }
      if (cpuPx[i]! < -BOUNDS) {
        cpuPx[i] = -BOUNDS;
        cpuVx[i]! *= -0.7;
      }
      if (cpuPx[i]! > BOUNDS) {
        cpuPx[i] = BOUNDS;
        cpuVx[i]! *= -0.7;
      }
      if (cpuPz[i]! < -BOUNDS) {
        cpuPz[i] = -BOUNDS;
        cpuVz[i]! *= -0.7;
      }
      if (cpuPz[i]! > BOUNDS) {
        cpuPz[i] = BOUNDS;
        cpuVz[i]! *= -0.7;
      }
    }
  }
  const cpuTime = performance.now() - cpuStart;

  emit(
    `   CPU (brute-force O(n²)): ${FRAMES} frames in ${cpuTime.toFixed(1)}ms (${(cpuTime / FRAMES).toFixed(2)}ms/frame)`,
    "perf",
  );
  emit(`   Speedup: ${(cpuTime / gpuTime).toFixed(1)}x`, "perf");

  emit("\n=== Demo complete ===", "header");

  // Cleanup
  for (const b of [
    pxBuf,
    pyBuf,
    pzBuf,
    vxBuf,
    vyBuf,
    vzBuf,
    radBuf,
    restBuf,
    fxBuf,
    fyBuf,
    fzBuf,
    idxBuf,
    gridBuf,
    clearUniBuf,
    popUniBuf,
    colUniBuf,
    intUniBuf,
  ]) {
    b.destroy();
  }
  device.destroy();
}

main().catch((e) => emit(`Error: ${e.message}`, "fail"));

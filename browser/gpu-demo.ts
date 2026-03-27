/**
 * GPU Compute Demo — runs in browser with real WebGPU.
 *
 * Dispatches a particle integration kernel on the GPU, reads back results,
 * and compares with a CPU reference implementation.
 *
 * Open: http://localhost:4000/gpu-demo.html
 */

import { createWorld, addEntity, addComponent, getStore, query } from "../engine/ecs/world.js";
import { queryEntities } from "../engine/ecs/query.js";
import { Velocity } from "../engine/ecs/components/velocity.js";
import { GpuParticleTag, GpuParticleLife } from "../engine/gpu/components/particle.js";
import { GpuPosition } from "../engine/gpu/components/position.js";
import { gpuParticleIntegrateKernel } from "../engine/gpu/systems/particle.js";
import {
  generateWgsl,
  countBindings,
  getComponentDef,
  getFieldNames,
} from "../engine/gpu/kernel.js";

const log = document.getElementById("log")!;

function emit(text: string, cls?: string): void {
  const span = document.createElement("span");
  span.className = cls ?? "";
  span.textContent = text + "\n";
  log.appendChild(span);
}

async function main() {
  emit("=== GPU Compute Demo: Particle System ===", "header");
  emit("");

  // --- 1. Init WebGPU ---
  if (!navigator.gpu) {
    emit("WebGPU not available in this browser.", "fail");
    return;
  }

  const adapter = await navigator.gpu.requestAdapter();
  if (!adapter) {
    emit("No GPU adapter found.", "fail");
    return;
  }

  const device = await adapter.requestDevice({
    requiredLimits: {
      maxStorageBuffersPerShaderStage: adapter.limits.maxStorageBuffersPerShaderStage,
    },
  });
  emit("1. WebGPU device initialized", "pass");

  // --- 2. Generate and compile WGSL ---
  const wgsl = generateWgsl(gpuParticleIntegrateKernel);
  emit(
    `2. WGSL generated (${wgsl.split("\n").length} lines, ${countBindings(gpuParticleIntegrateKernel)} bindings)`,
    "pass",
  );

  const module = device.createShaderModule({ code: wgsl });
  const compilationInfo = await module.getCompilationInfo();
  const errors = compilationInfo.messages.filter((m) => m.type === "error");
  if (errors.length > 0) {
    emit(`   Shader compilation failed: ${errors[0]!.message}`, "fail");
    return;
  }
  emit("   Shader compiled successfully", "pass");

  const pipeline = device.createComputePipeline({
    layout: "auto",
    compute: { module, entryPoint: "main" },
  });
  emit("   Compute pipeline created", "pass");

  // --- 3. Create world with particles ---
  const PARTICLE_COUNT = 100_000;
  const world = createWorld(PARTICLE_COUNT + 64);

  for (let i = 0; i < PARTICLE_COUNT; i++) {
    const eid = addEntity(world);
    addComponent(world, eid, GpuParticleTag);
    addComponent(world, eid, GpuPosition, {
      px: (Math.random() - 0.5) * 2,
      py: 0,
      pz: (Math.random() - 0.5) * 2,
    });
    addComponent(world, eid, Velocity, {
      vx: (Math.random() - 0.5) * 5,
      vy: 10 + Math.random() * 10,
      vz: (Math.random() - 0.5) * 5,
    });
    addComponent(world, eid, GpuParticleLife, {
      age: 0,
      maxAge: 2 + Math.random() * 3,
    });
  }
  emit(`\n3. Spawned ${PARTICLE_COUNT} particles`, "pass");

  // --- 4. Get query results for dispatch indices ---
  const q = query(world, [GpuParticleTag, GpuPosition, Velocity, GpuParticleLife]);
  const entities = queryEntities(q);
  const indexData = new Uint32Array(entities as number[]);
  emit(`   Query matched ${indexData.length} entities`);

  // --- 5. Create GPU buffers and upload data ---
  const DT = 1 / 60;
  const GRAVITY = -9.8;

  // Uniform buffer
  const uniformData = new Float32Array([DT, GRAVITY]);
  const uniformBuffer = device.createBuffer({
    size: uniformData.byteLength,
    usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
  });
  device.queue.writeBuffer(uniformBuffer, 0, uniformData);

  // Index buffer
  const indexBuffer = device.createBuffer({
    size: indexData.byteLength,
    usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
  });
  device.queue.writeBuffer(indexBuffer, 0, indexData);

  // Component field buffers — upload CPU TypedArrays
  type FieldBuf = {
    field: string;
    gpuBuf: GPUBuffer;
    cpuArray: Float32Array;
  };
  const fieldBuffers: FieldBuf[] = [];

  const allEntries = [...gpuParticleIntegrateKernel.read, ...gpuParticleIntegrateKernel.write];
  const emitted = new Set<number>();
  const writeIds = new Set(gpuParticleIntegrateKernel.write.map((e) => getComponentDef(e).id));

  for (const entry of allEntries) {
    const comp = getComponentDef(entry);
    if (emitted.has(comp.id)) continue;
    emitted.add(comp.id);

    const store = getStore(world, comp)!;
    const isWritable = writeIds.has(comp.id);
    const baseUsage = GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST;
    const usage = isWritable ? baseUsage | GPUBufferUsage.COPY_SRC : baseUsage;

    // Merge fields from all entries for this component
    const selectedFields = new Set<string>();
    for (const e of allEntries) {
      if (getComponentDef(e).id === comp.id) {
        for (const f of getFieldNames(e)) selectedFields.add(f);
      }
    }

    for (const field of selectedFields) {
      const cpuArray = store[field]! as Float32Array;
      const gpuBuf = device.createBuffer({
        size: cpuArray.byteLength,
        usage,
        label: `${comp.id}:${field}`,
      });
      device.queue.writeBuffer(
        gpuBuf,
        0,
        cpuArray.buffer,
        cpuArray.byteOffset,
        cpuArray.byteLength,
      );
      fieldBuffers.push({ field, gpuBuf, cpuArray });
    }
  }

  emit(
    `   Created ${fieldBuffers.length + 2} GPU buffers (${fieldBuffers.length} fields + uniform + indices)`,
    "pass",
  );

  // --- 6. Create bind group ---
  const bindGroupEntries: GPUBindGroupEntry[] = [];
  let binding = 0;

  bindGroupEntries.push({ binding: binding++, resource: { buffer: uniformBuffer } });
  bindGroupEntries.push({ binding: binding++, resource: { buffer: indexBuffer } });
  for (const fb of fieldBuffers) {
    bindGroupEntries.push({ binding: binding++, resource: { buffer: fb.gpuBuf } });
  }

  const bindGroup = device.createBindGroup({
    layout: pipeline.getBindGroupLayout(0),
    entries: bindGroupEntries,
  });

  // --- 7. Dispatch GPU kernel ---
  const FRAMES = 60;
  const workgroups = Math.ceil(indexData.length / 64);

  emit(`\n4. Dispatching ${FRAMES} frames (${workgroups} workgroups per frame)...`, "header");

  const gpuStart = performance.now();
  for (let frame = 0; frame < FRAMES; frame++) {
    const encoder = device.createCommandEncoder();
    const pass = encoder.beginComputePass();
    pass.setPipeline(pipeline);
    pass.setBindGroup(0, bindGroup);
    pass.dispatchWorkgroups(workgroups);
    pass.end();
    device.queue.submit([encoder.finish()]);
  }
  await device.queue.onSubmittedWorkDone();
  const gpuTime = performance.now() - gpuStart;

  emit(
    `   GPU: ${FRAMES} frames in ${gpuTime.toFixed(1)}ms (${(gpuTime / FRAMES).toFixed(2)}ms/frame)`,
    "perf",
  );

  // --- 8. Readback GPU results ---
  emit("\n5. Reading back GPU results...", "header");

  const writeFieldBuffers = fieldBuffers.filter((fb) => {
    return (fb.gpuBuf.usage & GPUBufferUsage.COPY_SRC) !== 0;
  });

  for (const fb of writeFieldBuffers) {
    const staging = device.createBuffer({
      size: fb.cpuArray.byteLength,
      usage: GPUBufferUsage.MAP_READ | GPUBufferUsage.COPY_DST,
    });
    const encoder = device.createCommandEncoder();
    encoder.copyBufferToBuffer(fb.gpuBuf, 0, staging, 0, fb.cpuArray.byteLength);
    device.queue.submit([encoder.finish()]);
    await staging.mapAsync(GPUMapMode.READ);
    const mapped = new Float32Array(staging.getMappedRange());
    fb.cpuArray.set(mapped);
    staging.unmap();
    staging.destroy();
  }

  emit("   Readback complete", "pass");

  // --- 9. Show results ---
  const posStore = getStore(world, GpuPosition)!;
  const lifeStore = getStore(world, GpuParticleLife)!;

  emit("\n6. Sample particle states (after GPU simulation):", "header");
  for (let i = 0; i < 5; i++) {
    const eid = indexData[i]!;
    emit(
      `   Particle ${i}: pos=(${posStore.px[eid]!.toFixed(2)}, ${posStore.py[eid]!.toFixed(2)}, ${posStore.pz[eid]!.toFixed(2)}) ` +
        `age=${lifeStore.age[eid]!.toFixed(2)}/${lifeStore.maxAge[eid]!.toFixed(2)}`,
    );
  }

  // Verify particles moved and aged
  let movedCount = 0;
  let agedCount = 0;
  for (const eid of indexData) {
    if (posStore.py[eid]! !== 0) movedCount++;
    if (lifeStore.age[eid]! > 0) agedCount++;
  }
  emit("\n7. Verification:", "header");
  emit(
    `   Particles moved (non-zero Y): ${movedCount}/${PARTICLE_COUNT} ${movedCount === PARTICLE_COUNT ? "PASS" : "FAIL"}`,
    movedCount === PARTICLE_COUNT ? "pass" : "fail",
  );
  emit(
    `   Particles aged (age > 0): ${agedCount}/${PARTICLE_COUNT} ${agedCount === PARTICLE_COUNT ? "PASS" : "FAIL"}`,
    agedCount === PARTICLE_COUNT ? "pass" : "fail",
  );

  // --- 10. CPU comparison ---
  emit("\n8. CPU reference comparison:", "header");

  const cpuWorld = createWorld(PARTICLE_COUNT + 64);
  for (let i = 0; i < PARTICLE_COUNT; i++) {
    const eid = addEntity(cpuWorld);
    addComponent(cpuWorld, eid, GpuParticleTag);
    addComponent(cpuWorld, eid, GpuPosition, {
      px: (Math.random() - 0.5) * 2,
      py: 0,
      pz: (Math.random() - 0.5) * 2,
    });
    addComponent(cpuWorld, eid, Velocity, {
      vx: (Math.random() - 0.5) * 5,
      vy: 10 + Math.random() * 10,
      vz: (Math.random() - 0.5) * 5,
    });
    addComponent(cpuWorld, eid, GpuParticleLife, {
      age: 0,
      maxAge: 2 + Math.random() * 3,
    });
  }

  const cpuQ = query(cpuWorld, [GpuParticleTag, GpuPosition, Velocity, GpuParticleLife]);
  const cpuStart = performance.now();
  for (let frame = 0; frame < FRAMES; frame++) {
    const cpuEntities = queryEntities(cpuQ);
    const ct = getStore(cpuWorld, GpuPosition)!;
    const cv = getStore(cpuWorld, Velocity)!;
    const cl = getStore(cpuWorld, GpuParticleLife)!;
    for (const eid of cpuEntities) {
      ct.px[eid]! += cv.vx[eid]! * DT;
      ct.py[eid]! += (cv.vy[eid]! + GRAVITY) * DT;
      ct.pz[eid]! += cv.vz[eid]! * DT;
      cl.age[eid]! += DT;
    }
  }
  const cpuTime = performance.now() - cpuStart;

  emit(
    `   CPU: ${FRAMES} frames in ${cpuTime.toFixed(1)}ms (${(cpuTime / FRAMES).toFixed(2)}ms/frame)`,
    "perf",
  );
  emit(`   Speedup: ${(cpuTime / gpuTime).toFixed(1)}x`, "perf");

  emit("\n=== Demo complete ===", "header");

  // Cleanup
  uniformBuffer.destroy();
  indexBuffer.destroy();
  for (const fb of fieldBuffers) fb.gpuBuf.destroy();
  device.destroy();
}

main().catch((e) => emit(`Error: ${e.message}`, "fail"));

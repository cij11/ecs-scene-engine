import * as THREE from "three";
import {
  clearGridWgsl,
  populateGridWgsl,
  collisionWgsl,
  integrateWgsl,
  GRID_SIZE,
  MAX_PER_CELL,
  TOTAL_CELLS,
} from "../../../engine/gpu/systems/physics.js";

export default {
  title:
    "Tickets/feat-ESE-0012/feat-ESE-0012-06 Multi-pass GPU physics: broadphase + narrowphase + integration/Demo",
};

async function createPhysicsDemo(container: HTMLElement) {
  const MAX_BODIES = 8192;
  const INITIAL_BODIES = 64;
  const TARGET_FPS = 30;
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
    },
  });

  // Compile 4 passes
  const shaders = [clearGridWgsl, populateGridWgsl, collisionWgsl, integrateWgsl];
  const pipelines = shaders.map((code) => {
    const module = device.createShaderModule({ code });
    return device.createComputePipeline({
      layout: "auto",
      compute: { module, entryPoint: "main" },
    });
  });

  // Body data — allocate for max, init a subset
  const px = new Float32Array(MAX_BODIES);
  const py = new Float32Array(MAX_BODIES);
  const pz = new Float32Array(MAX_BODIES);
  const vx = new Float32Array(MAX_BODIES);
  const vy = new Float32Array(MAX_BODIES);
  const vz = new Float32Array(MAX_BODIES);
  const radii = new Float32Array(MAX_BODIES).fill(SPHERE_RADIUS);
  const rest = new Float32Array(MAX_BODIES).fill(0.6);
  const fx = new Float32Array(MAX_BODIES);
  const fy = new Float32Array(MAX_BODIES);
  const fz = new Float32Array(MAX_BODIES);
  const indices = new Uint32Array(MAX_BODIES);

  function initBody(i: number): void {
    px[i] = (Math.random() - 0.5) * BOUNDS * 1.5;
    py[i] = BOUNDS * 0.5 + Math.random() * BOUNDS * 0.5; // spawn in upper region
    pz[i] = (Math.random() - 0.5) * BOUNDS * 1.5;
    vx[i] = (Math.random() - 0.5) * 3;
    vy[i] = (Math.random() - 0.5) * 2;
    vz[i] = (Math.random() - 0.5) * 3;
    indices[i] = i;
  }

  for (let i = 0; i < MAX_BODIES; i++) {
    initBody(i);
  }

  let activeCount = INITIAL_BODIES;
  let stopped = false;

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
  const pzBuf = makeBuf(pz, SRW);
  const vxBuf = makeBuf(vx, SRW);
  const vyBuf = makeBuf(vy, SRW);
  const vzBuf = makeBuf(vz, SRW);
  const radBuf = makeBuf(radii, SR);
  const restBuf = makeBuf(rest, SR);
  const fxBuf = makeBuf(fx, SRW);
  const fyBuf = makeBuf(fy, SRW);
  const fzBuf = makeBuf(fz, SRW);
  const idxBuf = makeBuf(indices, SR);
  const gridBuf = device.createBuffer({
    size: TOTAL_CELLS * MAX_PER_CELL * 4,
    usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
  });

  const clearUniBuf = makeBuf(new Uint32Array([TOTAL_CELLS]), UNI);
  const popParams = new Float32Array(3);
  new Uint32Array(popParams.buffer)[0] = GRID_SIZE;
  popParams[1] = CELL_SIZE;
  popParams[2] = -BOUNDS;
  const popUniBuf = makeBuf(popParams, UNI);
  const colUniBuf = makeBuf(popParams, UNI);
  const intUniBuf = makeBuf(new Float32Array([1 / 60, -9.8, -BOUNDS, BOUNDS]), UNI);

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

  const gridWG = Math.ceil(TOTAL_CELLS / 64);

  const stagingPx = device.createBuffer({
    size: px.byteLength,
    usage: GPUBufferUsage.MAP_READ | GPUBufferUsage.COPY_DST,
  });
  const stagingPy = device.createBuffer({
    size: py.byteLength,
    usage: GPUBufferUsage.MAP_READ | GPUBufferUsage.COPY_DST,
  });
  const stagingPz = device.createBuffer({
    size: pz.byteLength,
    usage: GPUBufferUsage.MAP_READ | GPUBufferUsage.COPY_DST,
  });

  // Three.js
  const width = container.clientWidth || 800;
  const height = container.clientHeight || 600;
  const renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setSize(width, height);
  container.appendChild(renderer.domElement);

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x111111);
  const camera = new THREE.PerspectiveCamera(60, width / height, 0.1, 200);
  camera.position.set(0, BOUNDS * 0.8, BOUNDS * 2);
  camera.lookAt(0, 0, 0);

  scene.add(new THREE.AmbientLight(0xffffff, 0.4));
  const dirLight = new THREE.DirectionalLight(0xffffff, 1.0);
  dirLight.position.set(10, 20, 10);
  scene.add(dirLight);

  const instancedMesh = new THREE.InstancedMesh(
    new THREE.SphereGeometry(SPHERE_RADIUS, 12, 12),
    new THREE.MeshStandardMaterial({
      color: 0xff8800,
      roughness: 0.4,
      metalness: 0.3,
    }),
    MAX_BODIES,
  );
  instancedMesh.count = activeCount;
  scene.add(instancedMesh);

  scene.add(
    new THREE.Mesh(
      new THREE.BoxGeometry(BOUNDS * 2, BOUNDS * 2, BOUNDS * 2),
      new THREE.MeshBasicMaterial({ color: 0x444444, wireframe: true }),
    ),
  );

  const dummy = new THREE.Object3D();

  const hudEl = document.createElement("div");
  hudEl.style.cssText =
    "position:absolute;top:10px;left:10px;color:#eee;font-family:monospace;font-size:13px;background:rgba(0,0,0,0.7);padding:8px 12px;border-radius:4px;pointer-events:none;";
  container.style.position = "relative";
  container.appendChild(hudEl);

  let lastTime = performance.now();
  let fpsAccum = 0;
  let fpsCount = 0;
  let displayFps = 60; // assume 60 initially to avoid premature stop
  let angle = 0;
  let destroyed = false;

  let growthTimer = 0;
  let warmupTimer = 0;
  const WARMUP_MS = 3000;

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

    // Grow body count (after warmup to avoid shader compilation lag)
    warmupTimer += dt;
    if (!stopped && warmupTimer > WARMUP_MS) {
      growthTimer += dt;
      if (growthTimer >= 1000 && displayFps > 0) {
        growthTimer = 0;
        if (displayFps > TARGET_FPS) {
          // Add ~5% more bodies each second, minimum 8
          const toAdd = Math.max(16, Math.ceil(activeCount * 0.1));
          const newCount = Math.min(activeCount + toAdd, MAX_BODIES);
          // Re-init newly activated bodies at top of scene
          for (let i = activeCount; i < newCount; i++) {
            initBody(i);
          }
          activeCount = newCount;
          // Re-upload index buffer with new count
          device.queue.writeBuffer(idxBuf, 0, indices.buffer, 0, activeCount * 4);
          instancedMesh.count = activeCount;
        } else {
          stopped = true;
        }
        if (activeCount >= MAX_BODIES) {
          stopped = true;
        }
      }
    }

    const bodyWG = Math.ceil(activeCount / 64);

    // 4-pass GPU physics
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
    p3.setBindGroup(0, colBG);
    p3.dispatchWorkgroups(bodyWG);
    p3.end();
    const p4 = encoder.beginComputePass();
    p4.setPipeline(pipelines[3]!);
    p4.setBindGroup(0, intBG);
    p4.dispatchWorkgroups(bodyWG);
    p4.end();

    encoder.copyBufferToBuffer(pxBuf, 0, stagingPx, 0, px.byteLength);
    encoder.copyBufferToBuffer(pyBuf, 0, stagingPy, 0, py.byteLength);
    encoder.copyBufferToBuffer(pzBuf, 0, stagingPz, 0, pz.byteLength);
    device.queue.submit([encoder.finish()]);

    await stagingPx.mapAsync(GPUMapMode.READ);
    await stagingPy.mapAsync(GPUMapMode.READ);
    await stagingPz.mapAsync(GPUMapMode.READ);
    px.set(new Float32Array(stagingPx.getMappedRange()));
    py.set(new Float32Array(stagingPy.getMappedRange()));
    pz.set(new Float32Array(stagingPz.getMappedRange()));
    stagingPx.unmap();
    stagingPy.unmap();
    stagingPz.unmap();

    for (let i = 0; i < activeCount; i++) {
      dummy.position.set(px[i]!, py[i]!, pz[i]!);
      dummy.updateMatrix();
      instancedMesh.setMatrixAt(i, dummy.matrix);
    }
    instancedMesh.instanceMatrix.needsUpdate = true;

    angle += 0.003;
    camera.position.x = Math.sin(angle) * BOUNDS * 2;
    camera.position.z = Math.cos(angle) * BOUNDS * 2;
    camera.lookAt(0, 0, 0);

    renderer.render(scene, camera);

    const status = stopped
      ? activeCount >= MAX_BODIES
        ? "MAX"
        : `stopped @ ${TARGET_FPS}fps`
      : "growing...";
    hudEl.textContent = `${activeCount} bodies | ${displayFps} fps | GPU physics | ${status}`;

    requestAnimationFrame(frame);
  }

  requestAnimationFrame(frame);
  return () => {
    destroyed = true;
    renderer.dispose();
    device.destroy();
  };
}

export const Demo = {
  render: () => {
    const container = document.createElement("div");
    container.style.cssText = "width: 100%; height: 600px; background: #111;";
    setTimeout(() => createPhysicsDemo(container), 0);
    return container;
  },
};

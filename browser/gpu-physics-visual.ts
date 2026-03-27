/**
 * GPU Physics Visual Demo — Three.js spheres driven by GPU compute.
 *
 * 4-pass compute pipeline runs physics, reads back positions,
 * and updates Three.js InstancedMesh each frame.
 *
 * Open: http://localhost:4000/gpu-physics-visual.html
 */

import * as THREE from "three";
import {
  clearGridWgsl,
  populateGridWgsl,
  collisionWgsl,
  integrateWgsl,
  GRID_SIZE,
  MAX_PER_CELL,
  TOTAL_CELLS,
} from "../engine/gpu/systems/physics.js";

const hud = document.getElementById("hud")!;

async function main() {
  // --- 1. Init WebGPU ---
  if (!navigator.gpu) {
    hud.textContent = "WebGPU not available";
    return;
  }
  const adapter = await navigator.gpu.requestAdapter();
  if (!adapter) {
    hud.textContent = "No GPU adapter";
    return;
  }
  const device = await adapter.requestDevice({
    requiredLimits: {
      maxStorageBuffersPerShaderStage: adapter.limits.maxStorageBuffersPerShaderStage,
    },
  });

  // --- 2. Compile shaders ---
  const passes = [
    { name: "clearGrid", code: clearGridWgsl },
    { name: "populateGrid", code: populateGridWgsl },
    { name: "collision", code: collisionWgsl },
    { name: "integrate", code: integrateWgsl },
  ];

  const pipelines: GPUComputePipeline[] = [];
  for (const p of passes) {
    const module = device.createShaderModule({ code: p.code });
    pipelines.push(
      device.createComputePipeline({ layout: "auto", compute: { module, entryPoint: "main" } }),
    );
  }

  // --- 3. Create bodies ---
  const BODY_COUNT = 512;
  const BOUNDS = 10;
  const CELL_SIZE = (BOUNDS * 2) / GRID_SIZE;
  const SPHERE_RADIUS = 0.3;

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
    px[i] = (Math.random() - 0.5) * BOUNDS * 1.5;
    py[i] = Math.random() * BOUNDS;
    pz[i] = (Math.random() - 0.5) * BOUNDS * 1.5;
    velX[i] = (Math.random() - 0.5) * 3;
    velY[i] = (Math.random() - 0.5) * 2;
    velZ[i] = (Math.random() - 0.5) * 3;
    radii[i] = SPHERE_RADIUS;
    rest[i] = 0.6;
    indices[i] = i;
  }

  // --- 4. Create GPU buffers ---
  function makeBuf(data: Float32Array | Uint32Array | Int32Array, usage: number): GPUBuffer {
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

  const gridData = new Int32Array(TOTAL_CELLS * MAX_PER_CELL).fill(-1);
  const gridBuf = device.createBuffer({
    size: gridData.byteLength,
    usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
  });

  // Uniform buffers
  const clearParams = new Uint32Array([TOTAL_CELLS]);
  const clearUniBuf = makeBuf(clearParams, UNI);

  const popParams = new Float32Array(3);
  new Uint32Array(popParams.buffer)[0] = GRID_SIZE;
  popParams[1] = CELL_SIZE;
  popParams[2] = -BOUNDS;
  const popUniBuf = makeBuf(popParams, UNI);

  const colParams = new Float32Array(3);
  new Uint32Array(colParams.buffer)[0] = GRID_SIZE;
  colParams[1] = CELL_SIZE;
  colParams[2] = -BOUNDS;
  const colUniBuf = makeBuf(colParams, UNI);

  const intParams = new Float32Array([1 / 60, -9.8, -BOUNDS, BOUNDS]);
  const intUniBuf = makeBuf(intParams, UNI);

  // --- 5. Bind groups ---
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

  const bodyWG = Math.ceil(BODY_COUNT / 64);
  const gridWG = Math.ceil(TOTAL_CELLS / 64);

  // Staging buffers for readback
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

  // --- 6. Three.js setup ---
  const renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.setPixelRatio(window.devicePixelRatio);
  document.body.appendChild(renderer.domElement);

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x111111);

  const camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.1, 200);
  camera.position.set(0, BOUNDS * 0.8, BOUNDS * 2);
  camera.lookAt(0, 0, 0);

  // Lights
  scene.add(new THREE.AmbientLight(0xffffff, 0.4));
  const dirLight = new THREE.DirectionalLight(0xffffff, 1.0);
  dirLight.position.set(10, 20, 10);
  scene.add(dirLight);

  // InstancedMesh for all bodies
  const sphereGeo = new THREE.SphereGeometry(SPHERE_RADIUS, 12, 12);
  const sphereMat = new THREE.MeshStandardMaterial({
    color: 0xff8800,
    roughness: 0.4,
    metalness: 0.3,
  });
  const instancedMesh = new THREE.InstancedMesh(sphereGeo, sphereMat, BODY_COUNT);
  scene.add(instancedMesh);

  // Box wireframe for bounds
  const boxGeo = new THREE.BoxGeometry(BOUNDS * 2, BOUNDS * 2, BOUNDS * 2);
  const boxMat = new THREE.MeshBasicMaterial({ color: 0x444444, wireframe: true });
  const box = new THREE.Mesh(boxGeo, boxMat);
  scene.add(box);

  const dummy = new THREE.Object3D();

  // Resize handler
  window.addEventListener("resize", () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
  });

  // --- 7. Animation loop ---
  let lastTime = performance.now();
  let fpsAccum = 0;
  let fpsCount = 0;
  let displayFps = 0;

  // Rotate camera slowly
  let angle = 0;

  async function frame() {
    const now = performance.now();
    const dt = now - lastTime;
    lastTime = now;

    fpsAccum += dt;
    fpsCount++;
    if (fpsAccum >= 1000) {
      displayFps = Math.round((fpsCount * 1000) / fpsAccum);
      fpsAccum = 0;
      fpsCount = 0;
    }

    // GPU physics dispatch (4 passes)
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

    // Readback positions
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

    // Update instanced mesh
    for (let i = 0; i < BODY_COUNT; i++) {
      dummy.position.set(px[i]!, py[i]!, pz[i]!);
      dummy.updateMatrix();
      instancedMesh.setMatrixAt(i, dummy.matrix);
    }
    instancedMesh.instanceMatrix.needsUpdate = true;

    // Rotate camera
    angle += 0.003;
    camera.position.x = Math.sin(angle) * BOUNDS * 2;
    camera.position.z = Math.cos(angle) * BOUNDS * 2;
    camera.lookAt(0, 0, 0);

    // Render
    renderer.render(scene, camera);

    hud.textContent = `${BODY_COUNT} bodies | ${displayFps} fps | GPU physics (4-pass spatial hash)`;

    requestAnimationFrame(frame);
  }

  requestAnimationFrame(frame);
}

main().catch((e) => {
  hud.textContent = `Error: ${e.message}`;
  console.error(e);
});

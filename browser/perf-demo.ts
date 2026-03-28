/**
 * Perf ramp-up demo — demonstrates the ramp-test framework.
 *
 * Spawns Three.js cubes in a growing grid. The ramp-test framework
 * increases the grid size each step until FPS drops below 40.
 *
 * Open: http://localhost:4000/perf-demo.html
 */

import * as THREE from "three";
import { startRampTest, type RampTestResult } from "../engine/perf/ramp-test.js";

const container = document.getElementById("container")!;
const hud = document.getElementById("hud")!;

// --- Three.js setup ---
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(container.clientWidth, container.clientHeight);
renderer.setPixelRatio(window.devicePixelRatio);
container.appendChild(renderer.domElement);

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x111111);

const camera = new THREE.PerspectiveCamera(
  60,
  container.clientWidth / container.clientHeight,
  0.1,
  1000,
);
camera.position.set(0, 30, 50);
camera.lookAt(0, 0, 0);

// Lighting
const ambient = new THREE.AmbientLight(0x404040);
scene.add(ambient);
const directional = new THREE.DirectionalLight(0xffffff, 0.8);
directional.position.set(10, 20, 10);
scene.add(directional);

// Shared geometry and material for all cubes
const cubeGeometry = new THREE.BoxGeometry(0.8, 0.8, 0.8);
const cubeMaterial = new THREE.MeshPhongMaterial({ color: 0x4fc3f7 });

// Track cubes so we can add/remove them
const cubes: THREE.Mesh[] = [];

function setCubeCount(count: number): void {
  // Add cubes if needed
  while (cubes.length < count) {
    const mesh = new THREE.Mesh(cubeGeometry, cubeMaterial);
    // Arrange in a growing spiral/grid pattern
    const i = cubes.length;
    const gridSize = Math.ceil(Math.sqrt(count));
    const x = (i % gridSize) - gridSize / 2;
    const z = Math.floor(i / gridSize) - gridSize / 2;
    mesh.position.set(x * 1.1, 0, z * 1.1);
    scene.add(mesh);
    cubes.push(mesh);
  }

  // Remove cubes if we have too many (shouldn't happen in ramp-up)
  while (cubes.length > count) {
    const mesh = cubes.pop()!;
    scene.remove(mesh);
  }
}

// Re-layout all cubes when the count changes so they form a nice grid
function layoutCubes(): void {
  const count = cubes.length;
  const gridSize = Math.ceil(Math.sqrt(count));
  for (let i = 0; i < count; i++) {
    const x = (i % gridSize) - gridSize / 2;
    const z = Math.floor(i / gridSize) - gridSize / 2;
    cubes[i]!.position.set(x * 1.1, Math.sin(i * 0.1) * 0.5, z * 1.1);
  }

  // Pull camera back based on grid size
  camera.position.set(0, gridSize * 0.8, gridSize * 1.5);
  camera.lookAt(0, 0, 0);
}

// Animate cubes slightly each frame for visual interest
let animTime = 0;
function animateCubes(dt: number): void {
  animTime += dt * 0.001;
  for (let i = 0; i < cubes.length; i++) {
    const cube = cubes[i]!;
    cube.position.y = Math.sin(animTime + i * 0.05) * 0.5;
    cube.rotation.y = animTime + i * 0.01;
  }
}

// --- Render loop (runs independently of the ramp test) ---
let lastRenderTime = performance.now();

function renderLoop(): void {
  const now = performance.now();
  const dt = now - lastRenderTime;
  lastRenderTime = now;

  animateCubes(dt);
  renderer.render(scene, camera);
  requestAnimationFrame(renderLoop);
}

requestAnimationFrame(renderLoop);

// --- Start the ramp test ---
const CUBE_INCREMENT = 500;
const INITIAL_CUBES = 500;

hud.textContent = "Starting ramp-up perf test...";

startRampTest({
  name: "Three.js Cubes Ramp-Up",
  fpsThreshold: 40,
  initialValue: INITIAL_CUBES,
  increment: CUBE_INCREMENT,
  stepIntervalMs: 1500,
  warmupMs: 2000,
  sampleWindow: 15,
  maxValue: 100000,

  onStep(value: number): void {
    setCubeCount(value);
    layoutCubes();
  },

  onFrame(stats): void {
    const fpsColor =
      stats.currentFps > 50 ? "#66bb6a" : stats.currentFps > 40 ? "#ffa726" : "#ef5350";
    hud.innerHTML = [
      `<span style="color:#4fc3f7;font-size:15px;">Perf Ramp-Up Demo</span>`,
      ``,
      `Cubes: <b>${stats.currentValue.toLocaleString()}</b>`,
      `FPS: <span style="color:${fpsColor}"><b>${stats.currentFps.toFixed(1)}</b></span>`,
      `Status: ${stats.isWarmup ? "warming up..." : "ramping..."}`,
      `Elapsed: ${(stats.elapsedMs / 1000).toFixed(1)}s`,
    ].join("<br>");
  },

  onComplete(result: RampTestResult): void {
    const lines = [
      `<span style="color:#4fc3f7;font-size:15px;">Ramp-Up Complete</span>`,
      ``,
      `Final cubes: <b>${result.finalValue.toLocaleString()}</b>`,
      `FPS at limit: <b>${result.fpsAtThreshold.toFixed(1)}</b>`,
      `Reached max: ${result.reachedMax ? "yes" : "no"}`,
      `Total time: ${(result.elapsedMs / 1000).toFixed(1)}s`,
      `Samples: ${result.samples.length}`,
      ``,
      `<span style="color:#888;">--- Samples ---</span>`,
    ];
    for (const s of result.samples) {
      const bar = "\u2588".repeat(Math.max(1, Math.round(s.fps / 5)));
      lines.push(
        `${s.value.toString().padStart(6)} cubes | ${s.fps.toFixed(0).padStart(3)} fps ${bar}`,
      );
    }
    hud.innerHTML = lines.join("<br>");

    console.log("Ramp test result:", result);
  },
});

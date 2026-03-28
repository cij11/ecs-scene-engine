/**
 * Interactive tilemap demo.
 *
 * Controls:
 *   1-5: select tile type (1=full, 2=triangle BL, 3=triangle BR, 4=half bottom, 5=half left)
 *   Click: paint selected tile at cursor
 *   C: toggle carve mode (click to carve circle at cursor)
 *   +/-: adjust carve radius
 *   R: reset all tiles to full
 *   E: clear all tiles (empty)
 *   D: toggle debug overlays
 */

import * as THREE from "three";
import {
  createTileSet,
  createTileSetSource,
  createTileData,
  createTileMapLayer,
  packCellKey,
  TILE_FULL,
  TILE_TRIANGLE_BL,
  TILE_TRIANGLE_BR,
  TILE_HALF_BOTTOM,
  TILE_HALF_LEFT,
} from "../engine/tilemap/types.js";
import type { ChunkMap } from "../engine/tilemap/carve.js";
import { carve } from "../engine/tilemap/carve.js";
import {
  createTileMapRenderState,
  renderTileMap,
  renderCarvedChunks,
  renderDebugOverlays,
} from "../engine/tilemap/render.js";

const GRID_SIZE = 12;
const TILE_NAMES = ["Full", "Tri BL", "Tri BR", "Half Bot", "Half Left"];

async function main() {
  const container = document.getElementById("game")!;

  const threeRenderer = new THREE.WebGLRenderer({ antialias: true });
  threeRenderer.setSize(container.clientWidth, container.clientHeight);
  threeRenderer.setPixelRatio(window.devicePixelRatio);
  container.appendChild(threeRenderer.domElement);

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x111122);

  const aspect = container.clientWidth / container.clientHeight;
  const halfH = GRID_SIZE / 2 + 1;
  const halfW = halfH * aspect;
  const cx = GRID_SIZE / 2;
  const cy = GRID_SIZE / 2;
  const camera = new THREE.OrthographicCamera(
    cx - halfW,
    cx + halfW,
    cy + halfH,
    cy - halfH,
    0.1,
    100,
  );
  camera.position.set(cx, cy, 10);
  camera.lookAt(cx, cy, 0);

  // --- TileSet ---
  const tileSet = createTileSet(1);
  const source = createTileSetSource(0);
  source.tiles.set(0, createTileData(TILE_FULL));
  source.tiles.set(1, createTileData(TILE_TRIANGLE_BL));
  source.tiles.set(2, createTileData(TILE_TRIANGLE_BR));
  source.tiles.set(3, createTileData(TILE_HALF_BOTTOM));
  source.tiles.set(4, createTileData(TILE_HALF_LEFT));
  tileSet.sources.set(0, source);

  // --- State ---
  const layer = createTileMapLayer(0, 32);
  const chunks: ChunkMap = new Map();
  const renderState = createTileMapRenderState();
  renderState.debugVisible = true;
  scene.add(renderState.group);

  let selectedTile = 0;
  let carveMode = false;
  let carveRadius = 1.0;

  // --- HUD ---
  const hud = document.createElement("div");
  hud.style.cssText =
    "position:absolute;top:10px;left:10px;color:#fff;font:14px monospace;background:rgba(0,0,0,0.7);padding:8px;border-radius:4px;pointer-events:none;";
  container.appendChild(hud);

  // Carve cursor preview
  const cursorGeom = new THREE.RingGeometry(0.9, 1.0, 32);
  const cursorMat = new THREE.MeshBasicMaterial({ color: 0xff4444, side: THREE.DoubleSide });
  const cursorMesh = new THREE.Mesh(cursorGeom, cursorMat);
  cursorMesh.position.z = 0.05;
  cursorMesh.visible = false;
  scene.add(cursorMesh);

  function updateCursorGeom() {
    cursorMesh.geometry.dispose();
    cursorMesh.geometry = new THREE.RingGeometry(carveRadius - 0.05, carveRadius + 0.05, 32);
  }

  // --- Fill initial grid ---
  function fillGrid() {
    layer.cells.clear();
    chunks.clear();
    for (let y = 0; y < GRID_SIZE; y++) {
      for (let x = 0; x < GRID_SIZE; x++) {
        layer.cells.set(packCellKey(x, y), { sourceId: 0, tileId: 0, alternativeId: 0 });
      }
    }
  }

  function clearGrid() {
    layer.cells.clear();
    chunks.clear();
  }

  fillGrid();

  // --- Auto-carve for demo: carve two circles so carved visuals are visible on load ---
  carve(layer, tileSet, chunks, {
    type: "circle",
    position: { x: 4, y: 6 },
    radius: 2.0,
  });
  carve(layer, tileSet, chunks, {
    type: "circle",
    position: { x: 8, y: 4 },
    radius: 1.5,
  });

  // --- Mouse → world conversion ---
  const raycaster = new THREE.Raycaster();
  const mouse = new THREE.Vector2();
  const worldPos = { x: 0, y: 0 };

  function updateWorldPos(event: MouseEvent) {
    const rect = threeRenderer.domElement.getBoundingClientRect();
    mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
    raycaster.setFromCamera(mouse, camera);
    const plane = new THREE.Plane(new THREE.Vector3(0, 0, 1), 0);
    const intersection = new THREE.Vector3();
    raycaster.ray.intersectPlane(plane, intersection);
    if (intersection) {
      worldPos.x = intersection.x;
      worldPos.y = intersection.y;
    }
  }

  // --- Event handlers ---
  threeRenderer.domElement.addEventListener("mousemove", (e) => {
    updateWorldPos(e);
    if (carveMode) {
      cursorMesh.position.x = worldPos.x;
      cursorMesh.position.y = worldPos.y;
    }
  });

  threeRenderer.domElement.addEventListener("click", (e) => {
    updateWorldPos(e);
    const cellX = Math.floor(worldPos.x);
    const cellY = Math.floor(worldPos.y);

    if (carveMode) {
      carve(layer, tileSet, chunks, {
        type: "circle",
        position: { x: worldPos.x, y: worldPos.y },
        radius: carveRadius,
      });
      needsRender = true;
    } else {
      if (cellX >= 0 && cellX < GRID_SIZE && cellY >= 0 && cellY < GRID_SIZE) {
        const key = packCellKey(cellX, cellY);
        // Remove old mesh so it gets recreated
        const oldMesh = renderState.tileMeshes.get(key);
        if (oldMesh) {
          renderState.tileGroup.remove(oldMesh);
          oldMesh.geometry.dispose();
          (oldMesh.material as THREE.Material).dispose();
          renderState.tileMeshes.delete(key);
        }
        layer.cells.set(key, { sourceId: 0, tileId: selectedTile, alternativeId: 0 });
        needsRender = true;
      }
    }
  });

  window.addEventListener("keydown", (e) => {
    if (e.key >= "1" && e.key <= "5") {
      selectedTile = parseInt(e.key) - 1;
      carveMode = false;
      cursorMesh.visible = false;
      needsRender = true;
    }
    if (e.key === "c" || e.key === "C") {
      carveMode = !carveMode;
      cursorMesh.visible = carveMode;
      updateCursorGeom();
      needsRender = true;
    }
    if (e.key === "d" || e.key === "D") {
      renderState.debugVisible = !renderState.debugVisible;
      needsRender = true;
    }
    if (e.key === "r" || e.key === "R") {
      // Clear render state (tiles + carved chunks)
      for (const [, mesh] of renderState.tileMeshes) {
        renderState.tileGroup.remove(mesh);
        mesh.geometry.dispose();
        (mesh.material as THREE.Material).dispose();
      }
      renderState.tileMeshes.clear();
      for (const [, mesh] of renderState.carvedChunkMeshes) {
        renderState.tileGroup.remove(mesh);
        mesh.geometry.dispose();
        (mesh.material as THREE.Material).dispose();
      }
      renderState.carvedChunkMeshes.clear();
      renderState.carvedChunkVersions.clear();
      fillGrid();
      needsRender = true;
    }
    if (e.key === "e" || e.key === "E") {
      for (const [, mesh] of renderState.tileMeshes) {
        renderState.tileGroup.remove(mesh);
        mesh.geometry.dispose();
        (mesh.material as THREE.Material).dispose();
      }
      renderState.tileMeshes.clear();
      for (const [, mesh] of renderState.carvedChunkMeshes) {
        renderState.tileGroup.remove(mesh);
        mesh.geometry.dispose();
        (mesh.material as THREE.Material).dispose();
      }
      renderState.carvedChunkMeshes.clear();
      renderState.carvedChunkVersions.clear();
      clearGrid();
      needsRender = true;
    }
    if (e.key === "=" || e.key === "+") {
      carveRadius = Math.min(carveRadius + 0.25, 5);
      updateCursorGeom();
      needsRender = true;
    }
    if (e.key === "-" || e.key === "_") {
      carveRadius = Math.max(carveRadius - 0.25, 0.25);
      updateCursorGeom();
      needsRender = true;
    }
  });

  window.addEventListener("resize", () => {
    threeRenderer.setSize(container.clientWidth, container.clientHeight);
    const a = container.clientWidth / container.clientHeight;
    const hw = halfH * a;
    camera.left = cx - hw;
    camera.right = cx + hw;
    camera.updateProjectionMatrix();
    needsRender = true;
  });

  // --- Render loop ---
  let needsRender = true;

  function updateHud() {
    const mode = carveMode ? `CARVE (radius ${carveRadius})` : `PAINT: ${TILE_NAMES[selectedTile]}`;
    const debug = renderState.debugVisible ? "ON" : "OFF";
    hud.innerHTML = [
      `Mode: ${mode}`,
      `Debug: ${debug}`,
      `Grid: ${GRID_SIZE}x${GRID_SIZE}`,
      `Chunks: ${chunks.size}`,
      "",
      "1-5: tile type | C: carve",
      "+/-: radius | D: debug",
      "R: reset | E: empty",
    ].join("<br>");
  }

  function render() {
    if (needsRender) {
      renderTileMap(renderState, layer, tileSet);
      renderCarvedChunks(renderState, layer, tileSet, chunks);
      renderDebugOverlays(renderState, layer, tileSet, chunks, GRID_SIZE);
      updateHud();
      needsRender = false;
    }
    threeRenderer.render(scene, camera);
    requestAnimationFrame(render);
  }

  requestAnimationFrame(render);
}

main().catch((e) => console.error("MAIN ERROR:", e));

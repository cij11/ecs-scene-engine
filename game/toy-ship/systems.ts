/**
 * Toy Ship — game-specific systems.
 *
 * Per-world state is stored in WeakMaps keyed by World,
 * so state does not leak across worlds, tests, or HMR reloads.
 */

import type { World } from "../../engine/ecs/world.js";
import { getStore } from "../../engine/ecs/world.js";
import { Transform } from "../../engine/ecs/components/transform.js";

// --- Per-world state ---

interface OrbitState {
  angle: number;
  shipEntityIndex: number;
}

interface OscillateState {
  time: number;
}

const orbitStates = new WeakMap<World, OrbitState>();
const oscillateStates = new WeakMap<World, OscillateState>();

// --- Configuration ---

const ORBIT_RADIUS = 5;
const ORBIT_SPEED = 0.5;
const OSCILLATE_SPEED = 2;

/**
 * Create an orbit system for a specific ship entity index.
 */
export function createOrbitSystem(shipEntityIndex: number) {
  return function orbitSystem(world: World, dt: number): void {
    const t = getStore(world, Transform);
    if (!t) return;

    let state = orbitStates.get(world);
    if (!state) {
      state = { angle: 0, shipEntityIndex };
      orbitStates.set(world, state);
    }

    state.angle += dt * ORBIT_SPEED;
    const eid = state.shipEntityIndex;

    t.px[eid] = Math.cos(state.angle) * ORBIT_RADIUS;
    t.pz[eid] = Math.sin(state.angle) * ORBIT_RADIUS;

    // Rotate ship to face direction of travel (tangent to orbit)
    const facing = state.angle + Math.PI / 2;
    t.rx[eid] = 0;
    t.ry[eid] = Math.sin(facing / 2);
    t.rz[eid] = 0;
    t.rw[eid] = Math.cos(facing / 2);
  };
}

/**
 * Oscillate system — each astronaut oscillates along one axis.
 * Expects exactly 3 entities at indices 0, 1, 2.
 * Entity 0 = X axis, Entity 1 = Y axis (offset for visibility), Entity 2 = Z axis.
 */
export function oscillateSystem(world: World, dt: number): void {
  const t = getStore(world, Transform);
  if (!t) return;

  let state = oscillateStates.get(world);
  if (!state) {
    state = { time: 0 };
    oscillateStates.set(world, state);
  }

  state.time += dt * OSCILLATE_SPEED;

  // Entity 0: oscillate along local X (offset in Z so visible from top-down)
  t.px[0] = Math.sin(state.time) * 1.5;
  t.py[0] = 0;
  t.pz[0] = -1;
  // Arrow points in +X: rotate -90° around Z
  t.rx[0] = 0;
  t.ry[0] = 0;
  t.rz[0] = Math.sin(-Math.PI / 4);
  t.rw[0] = Math.cos(-Math.PI / 4);

  // Entity 1: oscillate along local Y (offset in X and Z so visible from top-down)
  t.px[1] = 1;
  t.py[1] = Math.sin(state.time + (Math.PI * 2) / 3) * 1.5;
  t.pz[1] = 1;
  // Arrow points in +Y: default orientation
  t.rx[1] = 0;
  t.ry[1] = 0;
  t.rz[1] = 0;
  t.rw[1] = 1;

  // Entity 2: oscillate along local Z (offset in X so visible from top-down)
  t.px[2] = -1;
  t.py[2] = 0;
  t.pz[2] = Math.sin(state.time + (Math.PI * 4) / 3) * 1.5;
  // Arrow points in +Z: rotate 90° around X
  t.rx[2] = Math.sin(Math.PI / 4);
  t.ry[2] = 0;
  t.rz[2] = 0;
  t.rw[2] = Math.cos(Math.PI / 4);
}

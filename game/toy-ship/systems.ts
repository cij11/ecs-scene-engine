/**
 * Toy Ship — game-specific systems.
 */

import type { World } from "../../engine/ecs/world.js";
import { query, getStore } from "../../engine/ecs/world.js";
import { queryEntities } from "../../engine/ecs/query.js";
import { Transform } from "../../engine/ecs/components/transform.js";
import { Velocity } from "../../engine/ecs/components/velocity.js";

/**
 * Orbit system — makes the first entity orbit the origin.
 * Game-specific: not a core system.
 */
export function orbitSystem(world: World, dt: number): void {
  const q = query(world, [Transform]);
  const t = getStore(world, Transform)!;

  for (const eid of queryEntities(q)) {
    // Only orbit entity 0 (the ship)
    if (eid !== 0) continue;
    const angle = dt * 0.3;
    const px = t.px[eid]!;
    const pz = t.pz[eid]!;
    const cos = Math.cos(angle);
    const sin = Math.sin(angle);
    t.px[eid] = px * cos - pz * sin;
    t.pz[eid] = px * sin + pz * cos;
  }
}

/**
 * Wander system — makes astronauts wander randomly inside the ship.
 * Changes velocity direction periodically.
 */
let wanderTimer = 0;
export function wanderSystem(world: World, dt: number): void {
  const q = query(world, [Transform, Velocity]);
  const v = getStore(world, Velocity)!;
  const t = getStore(world, Transform)!;

  wanderTimer += dt;

  for (const eid of queryEntities(q)) {
    // Change direction every ~2 seconds
    if (wanderTimer > 2) {
      const speed = 0.5;
      const angle = Math.random() * Math.PI * 2;
      v.vx[eid] = Math.cos(angle) * speed;
      v.vz[eid] = Math.sin(angle) * speed;
    }

    // Clamp to interior bounds (-2 to 2 on x and z)
    const bound = 2;
    if (t.px[eid]! > bound) {
      t.px[eid] = bound;
      v.vx[eid] = -Math.abs(v.vx[eid]!);
    }
    if (t.px[eid]! < -bound) {
      t.px[eid] = -bound;
      v.vx[eid] = Math.abs(v.vx[eid]!);
    }
    if (t.pz[eid]! > bound) {
      t.pz[eid] = bound;
      v.vz[eid] = -Math.abs(v.vz[eid]!);
    }
    if (t.pz[eid]! < -bound) {
      t.pz[eid] = -bound;
      v.vz[eid] = Math.abs(v.vz[eid]!);
    }
  }

  if (wanderTimer > 2) wanderTimer = 0;
}

/**
 * Movement core system — applies Velocity to Transform each tick.
 */

import type { World } from "../world.js";
import { query, getStore } from "../world.js";
import { queryEntities } from "../query.js";
import { Transform } from "../components/transform.js";
import { Velocity } from "../components/velocity.js";

export function movementSystem(world: World, dt: number): void {
  const q = query(world, [Transform, Velocity]);
  const t = getStore(world, Transform)!;
  const v = getStore(world, Velocity)!;

  for (const eid of queryEntities(q)) {
    t.px[eid]! += v.vx[eid]! * dt;
    t.py[eid]! += v.vy[eid]! * dt;
    t.pz[eid]! += v.vz[eid]! * dt;
  }
}

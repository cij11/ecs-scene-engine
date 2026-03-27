/**
 * GPU physics components — rigid body, collider, and intent components.
 *
 * Physics has sole write authority over GpuPosition and GpuVelocity
 * for entities with GpuRigidBody. Game logic communicates via
 * GpuForce, GpuImpulse, and GpuTeleport.
 *
 * See architecture.md section 7.
 */

import { defineComponent, defineTag } from "../../ecs/component.js";

/** Marks an entity as a GPU-managed rigid body. Physics owns its position. */
export const GpuRigidBody = defineTag();

/** Sphere collider for broadphase/narrowphase. */
export const GpuCollider = defineComponent({
  radius: Float32Array,
});

/** Accumulated force — consumed by integration kernel each frame. */
export const GpuForce = defineComponent({
  fx: Float32Array,
  fy: Float32Array,
  fz: Float32Array,
});

/** Instantaneous velocity change — consumed and zeroed by integration kernel. */
export const GpuImpulse = defineComponent({
  ix: Float32Array,
  iy: Float32Array,
  iz: Float32Array,
});

/** Position override — consumed and deactivated by integration kernel. */
export const GpuTeleport = defineComponent({
  tx: Float32Array,
  ty: Float32Array,
  tz: Float32Array,
  active: Uint32Array,
});

/** GPU-side velocity for physics entities. */
export const GpuVelocity = defineComponent({
  vx: Float32Array,
  vy: Float32Array,
  vz: Float32Array,
});

/** Per-body mass for force/impulse calculations. */
export const GpuMass = defineComponent({
  mass: Float32Array,
  restitution: Float32Array,
});

/**
 * GPU 2D physics components.
 *
 * See architecture-2d.md for design rationale.
 */

import { defineComponent, defineTag } from "../../ecs/component.js";

/** Marks an entity as a 2D physics body. Selects the 2D physics pipeline. */
export const GpuBody2D = defineTag();

/** Circle collider — radius-based 2D collision shape. */
export const GpuCircleCollider = defineComponent({
  radius: Float32Array,
});

/**
 * World boundary — infinite line collider.
 * Defined by a unit normal (nx, ny) and distance from origin.
 * Entities collide against the normal side (positive half-space).
 * Equivalent to Godot's WorldBoundaryShape2D.
 */
export const GpuWorldBoundary = defineComponent({
  nx: Float32Array,
  ny: Float32Array,
  dist: Float32Array,
});

/** 2D velocity for physics bodies. */
export const GpuVelocity2D = defineComponent({
  vx: Float32Array,
  vy: Float32Array,
});

/** 2D force intent — consumed by integration kernel. */
export const GpuForce2D = defineComponent({
  fx: Float32Array,
  fy: Float32Array,
});

/** Mass and restitution for 2D bodies. */
export const GpuMass2D = defineComponent({
  mass: Float32Array,
  restitution: Float32Array,
});

/**
 * Scene instantiation — reads a scene's node tree and creates
 * an entity in an ECS world with the appropriate components.
 *
 * Simulation-relevant nodes (transform, body) become ECS components.
 * Rendering nodes stay on the static scene (accessed via SceneRef).
 * The entity gets a SceneRef component linking back to the scene.
 */

import type { World } from "../ecs/world.js";
import type { EntityId } from "../ecs/entity.js";
import {
  addEntity,
  addComponent,
} from "../ecs/world.js";
import { Transform } from "../ecs/components/transform.js";
import { Velocity } from "../ecs/components/velocity.js";
import { SceneRef } from "../core-components/scene-ref.js";
import type { SceneNode } from "./node.js";
import { walkNodes } from "./node.js";
import type { SceneId, SceneRegistry } from "./registry.js";
import { registerScene } from "./registry.js";

export interface InstantiateOptions {
  /** Override position */
  position?: [number, number, number];
  /** Override velocity */
  velocity?: [number, number, number];
}

/**
 * Instantiate a scene into a world.
 *
 * Reads the node tree, creates an entity, and populates it with
 * components derived from the nodes. Returns the entity ID.
 *
 * If the scene is not yet registered, it is registered automatically.
 */
export function instantiateScene(
  world: World,
  registry: SceneRegistry,
  sceneRoot: SceneNode,
  sceneId?: SceneId,
  options?: InstantiateOptions,
): EntityId {
  // Register scene if needed
  const id = sceneId ?? registerScene(registry, sceneRoot);

  const entity = addEntity(world);

  // Always add SceneRef
  addComponent(world, entity, SceneRef, { sceneId: id });

  // Walk nodes and extract simulation-relevant data
  let hasTransform = false;
  let tx = 0, ty = 0, tz = 0;
  let rx = 0, ry = 0, rz = 0, rw = 1;
  let ssx = 1, ssy = 1, ssz = 1;

  let hasVelocity = false;
  let vx = 0, vy = 0, vz = 0;

  walkNodes(sceneRoot, (node) => {
    switch (node.type) {
      case "transform":
        hasTransform = true;
        if (node.data.position) {
          const p = node.data.position as [number, number, number];
          tx = p[0]; ty = p[1]; tz = p[2];
        } else {
          tx = (node.data.x as number) ?? 0;
          ty = (node.data.y as number) ?? 0;
          tz = (node.data.z as number) ?? 0;
        }
        if (node.data.rotation) {
          const r = node.data.rotation as [number, number, number, number];
          rx = r[0]; ry = r[1]; rz = r[2]; rw = r[3];
        }
        if (node.data.scale) {
          const s = node.data.scale as [number, number, number];
          ssx = s[0]; ssy = s[1]; ssz = s[2];
        }
        break;

      case "body":
        if (node.data.velocity) {
          hasVelocity = true;
          const vel = node.data.velocity as [number, number, number];
          vx = vel[0]; vy = vel[1]; vz = vel[2];
        }
        break;
    }
  });

  // Apply overrides
  if (options?.position) {
    hasTransform = true;
    [tx, ty, tz] = options.position;
  }
  if (options?.velocity) {
    hasVelocity = true;
    [vx, vy, vz] = options.velocity;
  }

  // Add components
  if (hasTransform) {
    addComponent(world, entity, Transform, {
      px: tx, py: ty, pz: tz,
      rx, ry, rz, rw,
      sx: ssx, sy: ssy, sz: ssz,
    });
  }

  if (hasVelocity) {
    addComponent(world, entity, Velocity, { vx, vy, vz });
  }

  return entity;
}

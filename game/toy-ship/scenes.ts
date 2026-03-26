/**
 * Toy Ship — scene definitions.
 *
 * Static node trees defining the spaceship, astronaut, and space.
 */

import { createNode } from "../../engine/scene/node.js";
import type { SceneNode } from "../../engine/scene/node.js";

/** Astronaut — a small sphere that moves around inside the ship */
export const astronautScene: SceneNode = createNode("node", {}, [
  createNode("transform", { position: [0, 0, 0] }),
  createNode("body", { velocity: [0, 0, 0] }),
  createNode("renderer", {}, [
    createNode("mesh", { color: 0x44ff44, roughness: 0.6, metalness: 0.1 }),
  ]),
]);

/** Spaceship — a larger box that orbits in space */
export const spaceshipScene: SceneNode = createNode("node", {}, [
  createNode("transform", { position: [0, 0, 0] }),
  createNode("body", { velocity: [0, 0, 0] }),
  createNode("renderer", {}, [
    createNode("mesh", { color: 0x4488ff, roughness: 0.3, metalness: 0.5 }),
  ]),
]);

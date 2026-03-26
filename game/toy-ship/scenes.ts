/**
 * Toy Ship — scene definitions.
 *
 * Static node trees defining the sun, spaceship, and astronauts.
 */

import { createNode } from "../../engine/scene/node.js";
import type { SceneNode } from "../../engine/scene/node.js";

/** Sun — yellow sphere at the centre of the scene */
export const sunScene: SceneNode = createNode("node", {}, [
  createNode("transform", { position: [0, 0, 0] }),
  createNode("renderer", {}, [
    createNode("mesh", {
      geometryType: "sphere",
      color: 0xffcc00,
      roughness: 0.8,
      metalness: 0.0,
      scaleX: 1.5,
      scaleY: 1.5,
      scaleZ: 1.5,
    }),
  ]),
]);

/** Spaceship — blue box that orbits the sun */
export const spaceshipScene: SceneNode = createNode("node", {}, [
  createNode("transform", { position: [0, 0, 0] }),
  createNode("body", { velocity: [0, 0, 0] }),
  createNode("renderer", {}, [
    createNode("mesh", {
      geometryType: "box",
      color: 0x4488ff,
      roughness: 0.3,
      metalness: 0.5,
    }),
  ]),
]);

/** Astronaut — green arrow, aligned to +ve axis relative to ship */
export const astronautScene: SceneNode = createNode("node", {}, [
  createNode("transform", { position: [0, 0, 0] }),
  createNode("body", { velocity: [0, 0, 0] }),
  createNode("renderer", {}, [
    createNode("mesh", {
      geometryType: "arrow",
      color: 0x44ff44,
      roughness: 0.6,
      metalness: 0.1,
    }),
  ]),
]);

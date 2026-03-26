/**
 * ComponentSceneRef — links an ECS entity to its source scene definition.
 *
 * The view layer uses this to look up the entity's rendering nodes
 * from the static scene registry.
 */

import { defineComponent } from "../ecs/component.js";

export const SceneRef = defineComponent({ sceneId: Uint32Array });

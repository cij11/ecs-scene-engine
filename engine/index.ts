// World
export {
  type World,
  createWorld,
  destroyWorld,
  addEntity,
  removeEntity,
  hasEntity,
  addComponent,
  removeComponent,
  hasComponent,
  getComponent,
  getStore,
  query,
  queryResults,
  addSystem,
  removeSystem,
  tick,
  type EntityId,
  type Phase,
  type SystemFn,
  PHASES,
  Not,
  Any,
  type QueryTerm,
} from "./ecs/world.js";

// Component definitions
export {
  defineComponent,
  defineTag,
  type ComponentDef,
  type TagDef,
  type AnyComponentDef,
  type SchemaDefinition,
} from "./ecs/component.js";

// Query result access
export { queryEntities, type QueryResult } from "./ecs/query.js";

// Entity utilities
export { getIndex, getGeneration } from "./ecs/entity.js";

// Core components
export { Transform } from "./ecs/components/transform.js";
export { Velocity } from "./ecs/components/velocity.js";
export { SceneRef } from "./core-components/scene-ref.js";

// Scene
export {
  type SceneNode,
  type NodeType,
  createNode,
  findNodesByType,
  findRenderingNodes,
  walkNodes,
} from "./scene/node.js";
export {
  type SceneId,
  type SceneRegistry,
  createSceneRegistry,
  registerScene,
  getScene,
  lookupVisualNodes,
} from "./scene/registry.js";

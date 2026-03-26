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
export {
  queryEntities,
  type QueryResult,
} from "./ecs/query.js";

// Entity utilities
export {
  getIndex,
  getGeneration,
} from "./ecs/entity.js";

/**
 * World — ties together entity management, component storage,
 * bitmask tracking, query cache, and system pipeline.
 * One World per scene.
 */

import {
  type EntityId,
  type EntityIndex,
  createEntityIndex,
  createEntity as createEntityId,
  destroyEntity as destroyEntityId,
  hasEntity as hasEntityId,
  getIndex,
  getAliveEntities,
} from "./entity.js";
import {
  type AnyComponentDef,
  type ComponentDef,
  type SchemaDefinition,
  type ComponentRegistry,
  createComponentRegistry,
  ensureRegistered,
  ensureCapacity,
  setComponentData,
  getComponentData,
  getComponentStore,
} from "./component.js";
import {
  type BitmaskRegistry,
  createBitmaskRegistry,
  registerComponent as registerBitmask,
  addComponentBit,
  removeComponentBit,
  hasComponentBit,
  clearAllBits,
  growBitmaskCapacity,
} from "./bitmask.js";
import {
  type QueryRegistry,
  type QueryResult,
  type QueryTerm,
  createQueryRegistry,
  defineQuery as defineQueryInternal,
  notifyComponentAdded,
  notifyComponentRemoved,
  commitAllRemovals,
  queryEntities,
} from "./query.js";
import {
  type Pipeline,
  type Phase,
  type SystemFn,
  createPipeline,
  insertSystem as insertSystemInternal,
  removeSystem as removeSystemInternal,
  tickPipeline,
} from "./system.js";

export interface World {
  entityIndex: EntityIndex;
  components: ComponentRegistry;
  bitmasks: BitmaskRegistry;
  queries: QueryRegistry;
  pipeline: Pipeline;
}

export function createWorld(capacity: number = 1024): World {
  const bitmasks = createBitmaskRegistry(capacity);
  const entityIndex = createEntityIndex(capacity);
  return {
    entityIndex,
    components: createComponentRegistry(capacity),
    bitmasks,
    queries: createQueryRegistry(bitmasks, () =>
      Array.from(entityIndex.dense.subarray(0, entityIndex.aliveCount))
    ),
    pipeline: createPipeline(),
  };
}

export function destroyWorld(world: World): void {
  world.entityIndex.aliveCount = 0;
  world.components.storages.clear();
  world.components.schemas.clear();
  world.queries.cache.clear();
  world.queries.parsed.clear();
  world.queries.componentToQueries.clear();
  world.bitmasks.masks.clear();
  world.bitmasks.entityMasks = [];
  for (const phase of Object.keys(world.pipeline.phases) as Phase[]) {
    world.pipeline.phases[phase] = [];
  }
}

export function addEntity(world: World): EntityId {
  const id = createEntityId(world.entityIndex);
  const idx = getIndex(id);

  // Ensure all storages and bitmasks can hold this entity
  if (idx >= world.components.capacity) {
    ensureCapacity(world.components, idx + 1);
  }
  if (idx >= world.bitmasks.capacity) {
    growBitmaskCapacity(world.bitmasks, world.components.capacity);
  }

  return id;
}

export function removeEntity(world: World, id: EntityId): boolean {
  if (!hasEntityId(world.entityIndex, id)) return false;

  const idx = getIndex(id);
  clearAllBits(world.bitmasks, idx);

  // Notify all queries that this entity's components are gone
  for (const [componentId] of world.bitmasks.masks) {
    notifyComponentRemoved(world.queries, idx, componentId);
  }
  commitAllRemovals(world.queries);

  return destroyEntityId(world.entityIndex, id);
}

export function hasEntity(world: World, id: EntityId): boolean {
  return hasEntityId(world.entityIndex, id);
}

export function addComponent<S extends SchemaDefinition>(
  world: World,
  id: EntityId,
  def: ComponentDef<S> | AnyComponentDef,
  data?: Partial<{ [K in keyof S]: number }>,
): void {
  const idx = getIndex(id);

  ensureRegistered(world.components, def);
  registerBitmask(world.bitmasks, def);
  addComponentBit(world.bitmasks, idx, def);

  if (!def.isTag && data) {
    setComponentData(world.components, def as ComponentDef<S>, id, data);
  }

  notifyComponentAdded(world.queries, idx, def.id);
}

export function removeComponent(
  world: World,
  id: EntityId,
  def: AnyComponentDef,
): void {
  const idx = getIndex(id);
  removeComponentBit(world.bitmasks, idx, def);
  notifyComponentRemoved(world.queries, idx, def.id);
}

export function hasComponent(
  world: World,
  id: EntityId,
  def: AnyComponentDef,
): boolean {
  return hasComponentBit(world.bitmasks, getIndex(id), def);
}

export function getComponent<S extends SchemaDefinition>(
  world: World,
  def: ComponentDef<S>,
  id: EntityId,
): { [K in keyof S]: number } | undefined {
  return getComponentData(world.components, def, id);
}

export function getStore<S extends SchemaDefinition>(
  world: World,
  def: ComponentDef<S>,
) {
  return getComponentStore(world.components, def);
}

export function query(
  world: World,
  terms: QueryTerm[],
): QueryResult {
  return defineQueryInternal(world.queries, terms);
}

export function queryResults(
  world: World,
  terms: QueryTerm[],
): ReadonlyArray<number> {
  const q = defineQueryInternal(world.queries, terms);
  return queryEntities(q);
}

export function addSystem(
  world: World,
  phase: Phase,
  system: SystemFn,
): void {
  insertSystemInternal(world.pipeline, phase, system);
}

export function removeSystem(
  world: World,
  phase: Phase,
  system: SystemFn,
): boolean {
  return removeSystemInternal(world.pipeline, phase, system);
}

export function tick(world: World, dt: number): void {
  tickPipeline(world.pipeline, world, dt);
  commitAllRemovals(world.queries);
}

export { type EntityId } from "./entity.js";
export { type Phase, type SystemFn, PHASES } from "./system.js";
export { Not, Any, type QueryTerm } from "./query.js";

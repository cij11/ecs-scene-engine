/**
 * Component schema definition and SoA (Structure of Arrays) storage.
 *
 * Components are defined as schemas mapping field names to TypedArray
 * constructors. Each field gets its own contiguous TypedArray indexed
 * by entity index.
 */

import type { EntityId } from "./entity.js";
import { getIndex } from "./entity.js";

export type TypedArrayConstructor =
  | typeof Float32Array
  | typeof Float64Array
  | typeof Int8Array
  | typeof Int16Array
  | typeof Int32Array
  | typeof Uint8Array
  | typeof Uint16Array
  | typeof Uint32Array;

export type SchemaDefinition = Record<string, TypedArrayConstructor>;

export interface ComponentStorage<S extends SchemaDefinition> {
  stores: { [K in keyof S]: InstanceType<S[K]> };
  capacity: number;
}

let nextComponentId = 0;

export interface ComponentDef<S extends SchemaDefinition = SchemaDefinition> {
  readonly id: number;
  readonly schema: S;
  readonly isTag: false;
}

export interface TagDef {
  readonly id: number;
  readonly schema: null;
  readonly isTag: true;
}

export type AnyComponentDef = ComponentDef | TagDef;

export function defineComponent<S extends SchemaDefinition>(schema: S): ComponentDef<S> {
  return {
    id: nextComponentId++,
    schema,
    isTag: false,
  };
}

export function defineTag(): TagDef {
  return {
    id: nextComponentId++,
    schema: null,
    isTag: true,
  };
}

export function resetComponentIdCounter(): void {
  nextComponentId = 0;
}

export function createStorage<S extends SchemaDefinition>(
  schema: S,
  capacity: number,
): ComponentStorage<S> {
  const stores = {} as { [K in keyof S]: InstanceType<S[K]> };
  for (const key in schema) {
    const Ctor = schema[key]!;
    stores[key] = new Ctor(capacity) as InstanceType<S[typeof key]>;
  }
  return { stores, capacity };
}

export function growStorage<S extends SchemaDefinition>(
  storage: ComponentStorage<S>,
  schema: S,
  newCapacity: number,
): void {
  for (const key in schema) {
    const Ctor = schema[key]!;
    const newArray = new Ctor(newCapacity) as InstanceType<S[typeof key]>;
    (newArray as any).set(storage.stores[key]);
    storage.stores[key] = newArray;
  }
  storage.capacity = newCapacity;
}

/**
 * ComponentRegistry holds all component storages for a World.
 */
export interface ComponentRegistry {
  storages: Map<number, ComponentStorage<any>>;
  schemas: Map<number, SchemaDefinition>;
  capacity: number;
}

export function createComponentRegistry(capacity: number = 1024): ComponentRegistry {
  return {
    storages: new Map(),
    schemas: new Map(),
    capacity,
  };
}

export function ensureRegistered(
  registry: ComponentRegistry,
  def: AnyComponentDef,
): void {
  if (def.isTag) return;
  if (registry.storages.has(def.id)) return;

  const storage = createStorage(def.schema, registry.capacity);
  registry.storages.set(def.id, storage);
  registry.schemas.set(def.id, def.schema);
}

export function ensureCapacity(registry: ComponentRegistry, required: number): void {
  if (required <= registry.capacity) return;

  let newCapacity = registry.capacity;
  while (newCapacity < required) {
    newCapacity *= 2;
  }

  for (const [id, storage] of registry.storages) {
    const schema = registry.schemas.get(id)!;
    growStorage(storage, schema, newCapacity);
  }

  registry.capacity = newCapacity;
}

export function setComponentData<S extends SchemaDefinition>(
  registry: ComponentRegistry,
  def: ComponentDef<S>,
  entityId: EntityId,
  data: Partial<{ [K in keyof S]: number }>,
): void {
  const storage = registry.storages.get(def.id) as ComponentStorage<S> | undefined;
  if (!storage) return;

  const idx = getIndex(entityId);
  for (const key in data) {
    if (key in storage.stores) {
      (storage.stores[key] as any)[idx] = data[key]!;
    }
  }
}

export function getComponentData<S extends SchemaDefinition>(
  registry: ComponentRegistry,
  def: ComponentDef<S>,
  entityId: EntityId,
): { [K in keyof S]: number } | undefined {
  const storage = registry.storages.get(def.id) as ComponentStorage<S> | undefined;
  if (!storage) return undefined;

  const idx = getIndex(entityId);
  const result = {} as { [K in keyof S]: number };
  for (const key in def.schema) {
    result[key] = (storage.stores[key] as any)[idx] as number;
  }
  return result;
}

export function getComponentStore<S extends SchemaDefinition>(
  registry: ComponentRegistry,
  def: ComponentDef<S>,
): ComponentStorage<S>["stores"] | undefined {
  const storage = registry.storages.get(def.id) as ComponentStorage<S> | undefined;
  return storage?.stores;
}

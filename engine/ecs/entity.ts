/**
 * Entity ID management using a dense/sparse set with generational recycling.
 *
 * Entity IDs are plain numbers. The lower bits hold the index, the upper bits
 * hold a generation counter that increments on each recycle to prevent stale
 * ID aliasing.
 */

const INDEX_BITS = 20;
const INDEX_MASK = (1 << INDEX_BITS) - 1;
const GENERATION_SHIFT = INDEX_BITS;

export type EntityId = number;

export interface EntityIndex {
  dense: Uint32Array;
  sparse: Uint32Array;
  generations: Uint16Array;
  aliveCount: number;
  capacity: number;
}

export function createEntityIndex(capacity: number = 1024): EntityIndex {
  return {
    dense: new Uint32Array(capacity),
    sparse: new Uint32Array(capacity),
    generations: new Uint16Array(capacity),
    aliveCount: 0,
    capacity,
  };
}

function grow(index: EntityIndex): void {
  const newCapacity = index.capacity * 2;

  const newDense = new Uint32Array(newCapacity);
  newDense.set(index.dense);
  index.dense = newDense;

  const newSparse = new Uint32Array(newCapacity);
  newSparse.set(index.sparse);
  index.sparse = newSparse;

  const newGenerations = new Uint16Array(newCapacity);
  newGenerations.set(index.generations);
  index.generations = newGenerations;

  index.capacity = newCapacity;
}

export function createEntity(index: EntityIndex): EntityId {
  // Check if there are recycled IDs beyond aliveCount
  if (
    index.aliveCount < index.capacity &&
    index.dense[index.aliveCount] !== 0 &&
    index.aliveCount > 0
  ) {
    // Recycle: the slot at aliveCount in dense may hold a previously used index
  }

  let entityIndex: number;

  if (index.aliveCount > 0 && index.aliveCount < index.capacity) {
    // Check if there's a recycled entity at the dead region
    const recycledIndex = index.dense[index.aliveCount];
    if (
      recycledIndex !== undefined &&
      recycledIndex < index.capacity &&
      index.generations[recycledIndex]! > 0
    ) {
      // Reuse this recycled index
      entityIndex = recycledIndex;
      const densePos = index.aliveCount;
      index.dense[densePos] = entityIndex;
      index.sparse[entityIndex] = densePos;
      index.aliveCount++;
      return makeId(entityIndex, index.generations[entityIndex]!);
    }
  }

  // No recyclable IDs — allocate a new index
  entityIndex = index.aliveCount;

  if (entityIndex >= index.capacity) {
    grow(index);
  }

  const densePos = index.aliveCount;
  index.dense[densePos] = entityIndex;
  index.sparse[entityIndex] = densePos;
  index.aliveCount++;

  return makeId(entityIndex, index.generations[entityIndex]!);
}

export function destroyEntity(index: EntityIndex, id: EntityId): boolean {
  const entityIndex = getIndex(id);
  const generation = getGeneration(id);

  if (entityIndex >= index.capacity) return false;
  if (index.generations[entityIndex] !== generation) return false;

  const densePos = index.sparse[entityIndex]!;
  if (densePos >= index.aliveCount) return false;

  // Increment generation for recycling
  index.generations[entityIndex] = (generation + 1) & 0xffff;

  // Swap with last alive in dense array
  const lastAlive = index.aliveCount - 1;
  const lastIndex = index.dense[lastAlive]!;

  index.dense[densePos] = lastIndex;
  index.dense[lastAlive] = entityIndex;
  index.sparse[lastIndex] = densePos;
  index.sparse[entityIndex] = lastAlive;

  index.aliveCount--;
  return true;
}

export function hasEntity(index: EntityIndex, id: EntityId): boolean {
  const entityIndex = getIndex(id);
  const generation = getGeneration(id);

  if (entityIndex >= index.capacity) return false;
  if (index.generations[entityIndex] !== generation) return false;

  const densePos = index.sparse[entityIndex]!;
  return densePos < index.aliveCount;
}

export function getAliveEntities(index: EntityIndex): ReadonlyArray<number> {
  return Array.from(index.dense.subarray(0, index.aliveCount));
}

export function makeId(entityIndex: number, generation: number): EntityId {
  return (generation << GENERATION_SHIFT) | (entityIndex & INDEX_MASK);
}

export function getIndex(id: EntityId): number {
  return id & INDEX_MASK;
}

export function getGeneration(id: EntityId): number {
  return (id >>> GENERATION_SHIFT) & 0xffff;
}

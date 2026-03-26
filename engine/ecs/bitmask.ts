/**
 * Bitmask-based component membership tracking.
 *
 * Each component is assigned a bit position. Entity membership is tracked
 * in a 2D array: entityMasks[generation][entityIndex]. Each generation row
 * holds 31 usable bits (avoiding sign bit). When more than 31 components
 * are registered, a new generation row is added.
 */

import type { AnyComponentDef } from "./component.js";

const BITS_PER_ROW = 31;

export interface ComponentBitmask {
  generationId: number;
  bitflag: number;
}

export interface BitmaskRegistry {
  /** Maps component ID → bitmask position */
  masks: Map<number, ComponentBitmask>;
  /** entityMasks[generationId][entityIndex] = bitmask */
  entityMasks: Uint32Array[];
  /** Current generation being filled */
  currentGeneration: number;
  /** Next bit position in current generation */
  nextBit: number;
  /** Entity capacity */
  capacity: number;
}

export function createBitmaskRegistry(capacity: number = 1024): BitmaskRegistry {
  return {
    masks: new Map(),
    entityMasks: [new Uint32Array(capacity)],
    currentGeneration: 0,
    nextBit: 0,
    capacity,
  };
}

export function registerComponent(
  registry: BitmaskRegistry,
  def: AnyComponentDef,
): ComponentBitmask {
  const existing = registry.masks.get(def.id);
  if (existing) return existing;

  if (registry.nextBit >= BITS_PER_ROW) {
    registry.currentGeneration++;
    registry.nextBit = 0;
    registry.entityMasks.push(new Uint32Array(registry.capacity));
  }

  const mask: ComponentBitmask = {
    generationId: registry.currentGeneration,
    bitflag: 1 << registry.nextBit,
  };

  registry.nextBit++;
  registry.masks.set(def.id, mask);
  return mask;
}

export function addComponentBit(
  registry: BitmaskRegistry,
  entityIndex: number,
  def: AnyComponentDef,
): void {
  const mask = registry.masks.get(def.id);
  if (!mask) return;
  registry.entityMasks[mask.generationId]![entityIndex] |= mask.bitflag;
}

export function removeComponentBit(
  registry: BitmaskRegistry,
  entityIndex: number,
  def: AnyComponentDef,
): void {
  const mask = registry.masks.get(def.id);
  if (!mask) return;
  registry.entityMasks[mask.generationId]![entityIndex] &= ~mask.bitflag;
}

export function hasComponentBit(
  registry: BitmaskRegistry,
  entityIndex: number,
  def: AnyComponentDef,
): boolean {
  const mask = registry.masks.get(def.id);
  if (!mask) return false;
  return (registry.entityMasks[mask.generationId]![entityIndex]! & mask.bitflag) !== 0;
}

export function clearAllBits(registry: BitmaskRegistry, entityIndex: number): void {
  for (let g = 0; g <= registry.currentGeneration; g++) {
    registry.entityMasks[g]![entityIndex] = 0;
  }
}

export function growBitmaskCapacity(registry: BitmaskRegistry, newCapacity: number): void {
  for (let g = 0; g < registry.entityMasks.length; g++) {
    const newMasks = new Uint32Array(newCapacity);
    newMasks.set(registry.entityMasks[g]!);
    registry.entityMasks[g] = newMasks;
  }
  registry.capacity = newCapacity;
}

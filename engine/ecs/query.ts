/**
 * Query engine with all-of, none-of, any-of modifiers.
 *
 * Queries return live result sets backed by a dense/sparse set,
 * incrementally maintained on component add/remove. Deferred removal
 * allows safe mutation during iteration.
 */

import type { AnyComponentDef } from "./component.js";
import type { BitmaskRegistry, ComponentBitmask } from "./bitmask.js";

/** Query modifier wrappers */
export interface NotModifier {
  readonly kind: "not";
  readonly def: AnyComponentDef;
}

export interface AnyModifier {
  readonly kind: "any";
  readonly defs: AnyComponentDef[];
}

export type QueryTerm = AnyComponentDef | NotModifier | AnyModifier;

export function Not(def: AnyComponentDef): NotModifier {
  return { kind: "not", def };
}

export function Any(...defs: AnyComponentDef[]): AnyModifier {
  return { kind: "any", defs };
}

function isModifier(term: QueryTerm): term is NotModifier | AnyModifier {
  return typeof term === "object" && "kind" in term;
}

/** Dense/sparse set for query results */
export interface QueryResult {
  dense: number[];
  sparse: Map<number, number>;
  toRemove: Set<number>;
  dirty: boolean;
}

function createQueryResult(): QueryResult {
  return {
    dense: [],
    sparse: new Map(),
    toRemove: new Set(),
    dirty: false,
  };
}

function queryResultAdd(result: QueryResult, entityIndex: number): void {
  if (result.sparse.has(entityIndex)) return;
  result.sparse.set(entityIndex, result.dense.length);
  result.dense.push(entityIndex);
}

function queryResultRemove(result: QueryResult, entityIndex: number): void {
  const pos = result.sparse.get(entityIndex);
  if (pos === undefined) return;

  const last = result.dense.length - 1;
  if (pos !== last) {
    const lastEntity = result.dense[last]!;
    result.dense[pos] = lastEntity;
    result.sparse.set(lastEntity, pos);
  }
  result.dense.pop();
  result.sparse.delete(entityIndex);
}

function queryResultHas(result: QueryResult, entityIndex: number): boolean {
  return result.sparse.has(entityIndex);
}

/** Parsed query structure */
interface ParsedQuery {
  allOf: AnyComponentDef[];
  noneOf: AnyComponentDef[];
  anyOf: AnyComponentDef[];
  /** All component IDs involved (for notification routing) */
  involvedIds: Set<number>;
}

function parseQuery(terms: QueryTerm[]): ParsedQuery {
  const allOf: AnyComponentDef[] = [];
  const noneOf: AnyComponentDef[] = [];
  const anyOf: AnyComponentDef[] = [];
  const involvedIds = new Set<number>();

  for (const term of terms) {
    if (isModifier(term)) {
      if (term.kind === "not") {
        noneOf.push(term.def);
        involvedIds.add(term.def.id);
      } else {
        for (const def of term.defs) {
          anyOf.push(def);
          involvedIds.add(def.id);
        }
      }
    } else {
      allOf.push(term);
      involvedIds.add(term.id);
    }
  }

  return { allOf, noneOf, anyOf, involvedIds };
}

function hashQuery(terms: QueryTerm[]): string {
  const parts: string[] = [];
  for (const term of terms) {
    if (isModifier(term)) {
      if (term.kind === "not") {
        parts.push(`!${term.def.id}`);
      } else {
        parts.push(`?${term.defs.map(d => d.id).sort().join(",")}`);
      }
    } else {
      parts.push(String(term.id));
    }
  }
  return parts.sort().join("|");
}

/** Check if an entity matches a parsed query */
function matchesQuery(
  parsed: ParsedQuery,
  bitmasks: BitmaskRegistry,
  entityIndex: number,
): boolean {
  // All-of: entity must have all
  for (const def of parsed.allOf) {
    const mask = bitmasks.masks.get(def.id);
    if (!mask) return false;
    if ((bitmasks.entityMasks[mask.generationId]![entityIndex]! & mask.bitflag) === 0) {
      return false;
    }
  }

  // None-of: entity must have none
  for (const def of parsed.noneOf) {
    const mask = bitmasks.masks.get(def.id);
    if (!mask) continue;
    if ((bitmasks.entityMasks[mask.generationId]![entityIndex]! & mask.bitflag) !== 0) {
      return false;
    }
  }

  // Any-of: entity must have at least one (if any-of terms exist)
  if (parsed.anyOf.length > 0) {
    let hasAny = false;
    for (const def of parsed.anyOf) {
      const mask = bitmasks.masks.get(def.id);
      if (!mask) continue;
      if ((bitmasks.entityMasks[mask.generationId]![entityIndex]! & mask.bitflag) !== 0) {
        hasAny = true;
        break;
      }
    }
    if (!hasAny) return false;
  }

  return true;
}

/** Query registry for a world */
export interface QueryRegistry {
  /** Hash → QueryResult for deduplication */
  cache: Map<string, QueryResult>;
  /** Hash → ParsedQuery */
  parsed: Map<string, ParsedQuery>;
  /** Component ID → list of query hashes that involve this component */
  componentToQueries: Map<number, string[]>;
  /** Reference to the world's bitmask registry */
  bitmasks: BitmaskRegistry;
  /** Returns the entity indices currently alive — used for backfilling new queries */
  aliveEntities?: () => number[];
}

export function createQueryRegistry(
  bitmasks: BitmaskRegistry,
  aliveEntities?: () => number[],
): QueryRegistry {
  return {
    cache: new Map(),
    parsed: new Map(),
    componentToQueries: new Map(),
    bitmasks,
    aliveEntities,
  };
}

export function defineQuery(
  registry: QueryRegistry,
  terms: QueryTerm[],
): QueryResult {
  const hash = hashQuery(terms);

  const existing = registry.cache.get(hash);
  if (existing) return existing;

  const parsed = parseQuery(terms);
  const result = createQueryResult();

  registry.cache.set(hash, result);
  registry.parsed.set(hash, parsed);

  // Register for notifications from all involved components
  for (const id of parsed.involvedIds) {
    let queries = registry.componentToQueries.get(id);
    if (!queries) {
      queries = [];
      registry.componentToQueries.set(id, queries);
    }
    queries.push(hash);
  }

  // Backfill: scan existing entities for matches
  if (registry.aliveEntities) {
    for (const entityIndex of registry.aliveEntities()) {
      if (matchesQuery(parsed, registry.bitmasks, entityIndex)) {
        queryResultAdd(result, entityIndex);
      }
    }
  }

  return result;
}

/** Called when a component is added to an entity — update relevant queries */
export function notifyComponentAdded(
  registry: QueryRegistry,
  entityIndex: number,
  componentId: number,
): void {
  const queryHashes = registry.componentToQueries.get(componentId);
  if (!queryHashes) return;

  for (const hash of queryHashes) {
    const parsed = registry.parsed.get(hash)!;
    const result = registry.cache.get(hash)!;

    if (matchesQuery(parsed, registry.bitmasks, entityIndex)) {
      queryResultAdd(result, entityIndex);
    } else {
      // May have been invalidated by a Not() term
      if (queryResultHas(result, entityIndex)) {
        result.toRemove.add(entityIndex);
        result.dirty = true;
      }
    }
  }
}

/** Called when a component is removed from an entity — defer removal from queries */
export function notifyComponentRemoved(
  registry: QueryRegistry,
  entityIndex: number,
  componentId: number,
): void {
  const queryHashes = registry.componentToQueries.get(componentId);
  if (!queryHashes) return;

  for (const hash of queryHashes) {
    const parsed = registry.parsed.get(hash)!;
    const result = registry.cache.get(hash)!;

    if (!matchesQuery(parsed, registry.bitmasks, entityIndex)) {
      if (queryResultHas(result, entityIndex)) {
        result.toRemove.add(entityIndex);
        result.dirty = true;
      }
    } else {
      // May now match due to a Not() term being cleared
      queryResultAdd(result, entityIndex);
    }
  }
}

/** Commit deferred removals for a specific query */
export function commitRemovals(result: QueryResult): void {
  if (!result.dirty) return;

  for (const entityIndex of result.toRemove) {
    queryResultRemove(result, entityIndex);
  }
  result.toRemove.clear();
  result.dirty = false;
}

/** Commit deferred removals for all queries in a registry */
export function commitAllRemovals(registry: QueryRegistry): void {
  for (const result of registry.cache.values()) {
    commitRemovals(result);
  }
}

/** Iterate a query result, committing deferred removals first */
export function queryEntities(result: QueryResult): ReadonlyArray<number> {
  commitRemovals(result);
  return result.dense;
}

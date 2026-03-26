## Key takeaways from harmony-ecs

- Plain structs + module functions. No classes, no decorators.
- Schemas (components) are themselves entities, sharing the ID space. No separate component registry needed.
- Two storage modes chosen per-schema at definition time: binary (TypedArray SoA, SharedArrayBuffer-capable) and native (JS arrays for arbitrary objects).
- Archetype graph is a sorted trie. Types are normalised sorted integer arrays. Deterministic traversal, O(n) superset checks.
- Queries are live arrays of archetype records. No per-frame "query execution" — the result array is mutated in place when archetypes are added.
- Strong TypeScript type safety via phantom generics on Schema.Id. Full inference from schema definition through to query results with no casts.
- No built-in system scheduler. Systems are caller-managed functions.

## Key takeaways from bitecs

- Entities are plain integers. Dense/sparse set with optional generational versioning in upper bits.
- Components are any JS object used as a Map key. Membership tracked via 2D bitmask array (generation row x entity column), 31 components per row.
- Component data layout is entirely user-defined. Core only tracks membership. SoA is a convention, not enforced.
- Queries are live SparseSet results, incrementally updated on component add/remove. Cached by component signature hash.
- Deferred removals: component removal stages entity in toRemove buffer, committed before next query read.
- Systems are plain functions composed with pipe(). No system class or scheduler.
- Relations are higher-order functions producing cached pair-components.
- No classes anywhere — everything is functions operating on plain data.

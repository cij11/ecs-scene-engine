# GPU 2D Physics — Architecture Document

## 1. Overview

A 2D GPU physics system that coexists with the existing 3D system. Entities are assigned to either 2D or 3D physics via tag components — never both. The 2D system supports circle colliders and world boundary colliders (infinite lines).

## 2. 2D vs 3D Selection

Tag-based selection via component composition:

```
GpuBody2D + Transform + GpuVelocity2D → processed by 2D physics pipeline
GpuBody3D + Transform + GpuVelocity   → processed by 3D physics pipeline
```

The kernel query includes the tag, so 2D and 3D entities are naturally disjoint — no entity gets processed by both. Both write to the same `Transform` component (via field selection), so the renderer reads positions uniformly.

| Tag | Physics pipeline | Transform fields used | Velocity component |
|-----|-----------------|----------------------|-------------------|
| GpuBody2D | 2D (this doc) | px, py | GpuVelocity2D (vx, vy) |
| GpuBody3D | 3D (existing) | px, py, pz | GpuVelocity (vx, vy, vz) |

## 3. Collider Types

### GpuCircleCollider
```typescript
const GpuCircleCollider = defineComponent({
  radius: Float32Array,
});
```
Equivalent to sphere in 3D. Circle-circle collision uses distance check against sum of radii.

### GpuWorldBoundary
```typescript
const GpuWorldBoundary = defineComponent({
  nx: Float32Array,    // normal X (unit vector)
  ny: Float32Array,    // normal Y (unit vector)
  dist: Float32Array,  // distance from origin along normal
});
```

An infinite line in 2D space. Defined by a normal direction and distance from origin. Entities collide against the normal side (positive half-space). Equivalent to Godot's WorldBoundaryShape2D.

World boundaries are entities — they have `GpuWorldBoundary` but NOT `GpuBody2D` (they don't move or get integrated). The narrowphase queries them separately.

**Example: screen edges as world boundaries**
```
Bottom: nx=0, ny=1,  dist=-10   (normal points up)
Top:    nx=0, ny=-1, dist=-10   (normal points down)
Left:   nx=1, ny=0,  dist=-10   (normal points right)
Right:  nx=-1, ny=0, dist=-10   (normal points left)
```

## 4. 2D Spatial Hash Grid

Separate from the 3D grid. 2D grid is simpler:

- **Dimensions**: GRID_2D_SIZE × GRID_2D_SIZE (no Z axis)
- **Cell count**: GRID_2D_SIZE² (vs GRID_3D_SIZE³ for 3D)
- **Neighbor search**: 9 cells (vs 27 for 3D)
- **Hash**: `cellX + cellY * GRID_2D_SIZE`
- **Memory**: Much smaller — 64² × 4 slots × 4 bytes = 64KB (vs 64³ × 4 × 4 = 4MB for 3D)

```wgsl
fn gridIndex2D(x: i32, y: i32) -> u32 {
  let gs = i32(params.gridSize);
  let cx = clamp(x, 0, gs - 1);
  let cy = clamp(y, 0, gs - 1);
  return u32(cx + cy * gs);
}
```

## 5. 2D Physics Pipeline

5 passes in a single command encoder:

```
Pass 1: Clear 2D grid
Pass 2: Populate 2D grid (hash px, py of GpuBody2D entities)
Pass 3: Circle-circle collision (9-neighbor search, impulse response)
Pass 4: Circle-boundary collision (all bodies vs all boundary entities)
Pass 5: Integration (apply forces, gravity, integrate px/py)
```

### Pass 4: Circle-Boundary Collision

World boundary entities are queried separately — they're not in the spatial grid (they're infinite, so they don't hash to a cell). Instead, every dynamic body checks against every boundary:

```wgsl
// For each dynamic body:
for (var b = 0u; b < boundaryCount; b++) {
  let normal = vec2f(bnx[b], bny[b]);
  let d = bdist[b];

  // Signed distance from body center to boundary
  let bodyDist = dot(vec2f(px[eid], py[eid]), normal) - d;

  if (bodyDist < radius[eid]) {
    // Collision — reflect velocity and push out
    let overlap = radius[eid] - bodyDist;
    let relVel = dot(vec2f(vx[eid], vy[eid]), normal);

    if (relVel < 0.0) {
      let j = -(1.0 + restitution) * relVel;
      vx[eid] = vx[eid] + j * normal.x;
      vy[eid] = vy[eid] + j * normal.y;
    }

    // Separate
    px[eid] = px[eid] + normal.x * overlap;
    py[eid] = py[eid] + normal.y * overlap;
  }
}
```

This is O(bodies × boundaries). For a small number of boundaries (4-8 screen edges), this is trivial. If many boundaries are needed, they could go in a separate grid, but that's a future optimization.

## 6. Transform Field Selection

Using the field-level binding system (ESE-0017):

```typescript
const physics2DKernel: GpuKernelDef = {
  query: [GpuBody2D, Transform, GpuVelocity2D, GpuCircleCollider],
  read: [GpuCircleCollider],
  write: [
    fields(Transform, "px", "py"),     // only 2 fields, not 10
    GpuVelocity2D,                     // vx, vy
  ],
  ...
};
```

Binding count for integration pass:
- 1 uniform (dt, gravity, boundaryCount)
- 1 indices
- 1 read (radius)
- 2 write (px, py)
- 2 write (vx, vy)
- 3 read (boundary nx, ny, dist)
= **10 bindings** — within default WebGPU limit

## 7. Components Summary

| Component | Fields | Who has it | Purpose |
|-----------|--------|-----------|---------|
| GpuBody2D | (tag) | Dynamic 2D bodies | Selects 2D physics pipeline |
| GpuCircleCollider | radius | Dynamic 2D bodies | Circle collision shape |
| GpuWorldBoundary | nx, ny, dist | Static boundary entities | Infinite line collision |
| GpuVelocity2D | vx, vy | Dynamic 2D bodies | 2D velocity |
| GpuForce2D | fx, fy | Dynamic 2D bodies | Intent: accumulated force |
| GpuMass2D | mass, restitution | Dynamic 2D bodies | Mass for impulse calc |
| Transform | px, py (+ others) | All entities | Shared position (field-selected) |

## 8. File Structure

```
engine/gpu/
  architecture-2d.md       ← this document
  components/
    physics-2d.ts          ← GpuBody2D, GpuCircleCollider, GpuWorldBoundary, GpuVelocity2D, etc.
  systems/
    physics-2d.ts          ← 5 WGSL passes for 2D physics
```

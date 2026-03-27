# Tilemap Architecture

## Problem

We need a tilemap system that supports:
- Arbitrary polygon tiles (within tile bounds)
- Efficient terrain carving (subtracting shapes from tiles)
- Large multiplayer worlds
- Integration with the ECS architecture and WebGPU renderer

## Coordinate System

The lower-left corner of the lower-left cell is at `(0, 0)` in tilemap space. The centre of that cell is at `(0.5, 0.5)`.

```
     ┌───┬───┬───┐
 2   │   │   │   │
     ├───┼───┼───┤
 1   │   │   │   │
     ├───┼───┼───┤
 0   │ · │   │   │   · = (0.5, 0.5) = centre of cell (0,0)
     └───┴───┴───┘
     0   1   2   3
```

All tile geometry is defined in tilemap space. A tile at grid position `(x, y)` occupies the unit square from `(x, y)` to `(x+1, y+1)`.

## Terminology

We use Godot's tilemap terminology where possible. Extensions for features Godot doesn't have (chunking, density grids, multiplayer sync) use our own names.

| Term | Godot equivalent | Notes |
|------|-----------------|-------|
| TileSet | TileSet | Resource defining tile types |
| TileSetSource | TileSetAtlasSource | A source of tiles within a TileSet |
| TileData | TileData | Per-tile properties (polygon, physics, custom data) |
| TileMapLayer | TileMapLayer | A single layer of tiles |
| TerrainSet | TerrainSet | Group of terrain types for autotiling |
| PeeringBit | PeeringBit | Neighbour-matching bits for autotiling |
| AlternativeTile | AlternativeTile | Rotation/flip variants |
| PhysicsLayer | PhysicsLayer | Collision layer on TileSet |
| Quadrant | Quadrant | Physics/render batching unit |
| **Chunk** | *(no equivalent)* | Our extension: loading/sync unit for large worlds |
| **DensityGrid** | *(no equivalent)* | Our extension: scalar field for terrain carving |

## Data Model

### TileSet (resource, shared)

Defines tile types and their properties.

```typescript
interface TileSet {
  tileSize: number;           // world units per tile (default 1)
  sources: TileSetSource[];      // tile atlases / shape definitions
  physicsLayers: PhysicsLayerDef[];
  customDataLayers: CustomDataLayerDef[];
}

interface TileSetSource {
  id: number;
  tiles: Map<TileCoord, TileData>;
}

interface TileData {
  polygon: Vec2[];            // arbitrary polygon, vertices in [0,1] local space
  physicsPolygons: Vec2[][];  // collision shapes (may differ from visual)
  customData: Record<string, unknown>;
}
```

### TileMapLayer (ECS component)

A single layer of tiles. Multiple layers stack for parallax, foreground/background, etc.

```typescript
interface TileMapLayer {
  tileSetId: number;
  cells: Map<bigint, CellData>;   // sparse — packed (x,y) → cell
  chunks: Map<bigint, Chunk>;     // packed (cx,cy) → chunk
  chunkSize: number;              // tiles per chunk side (default 32)
}

interface CellData {
  sourceId: number;
  tileCoord: TileCoord;
  alternativeId: number;          // for rotations/variants
}
```

### Chunk

The unit of loading, rendering, physics, and network sync.

```typescript
interface Chunk {
  densityGrid: Uint8Array;    // for carved terrain — per-subcell density
  gridResolution: number;     // subcells per tile side (default 2 for carving)
  dirty: boolean;
  physicsVersion: number;
  networkVersion: number;
  collisionEdges: Vec2[][] | null;  // cached marching squares output
}
```

## Tile Polygons

Each tile definition contains a polygon — an array of vertices in `[0,1]` local space. This polygon can be any convex or concave shape, as long as it fits within the unit tile bounds.

Standard tiles:
- **Full square:** `[(0,0), (1,0), (1,1), (0,1)]`
- **Right triangle:** `[(0,0), (1,0), (0,1)]`
- **Half tile:** `[(0,0), (1,0), (1,0.5), (0,0.5)]`
- **Custom:** any polygon within bounds

The tile polygon defines both the visual shape and the default collision shape. Physics polygons can optionally override collision independently.

## Terrain Carving

### Approach: Density Grid + Marching Squares

When a tile is carved, we don't modify the polygon directly. Instead:

1. The tile's chunk allocates a **density grid** — a scalar field where each value represents terrain solidity (255 = fully solid, 0 = empty).
2. The carving operation sets density values to 0 within the subtracted shape.
3. **Marching squares** extracts the new terrain boundary from the density grid.
4. The extracted edges become both the collision shape and the render geometry.

### Why not polygon subtraction?

Polygon CSG (boolean difference) produces exact geometry but has fatal scaling problems:
- Vertex count grows unboundedly with each operation
- Performance degrades as complexity accumulates
- No natural way to simplify without visual artifacts
- Floating-point precision issues compound over many operations

### Why not pixel-based?

Pure pixel (bitmap) terrain works well for Worms-style games but:
- Converting to collision geometry requires marching squares anyway
- Memory scales with resolution squared
- Doesn't integrate cleanly with tile-based content authoring

### Chosen hybrid: density grid per chunk

The density grid is a middle ground:
- **Fixed memory** — grid resolution is bounded per chunk
- **Fast carving** — set values to 0 in a region, O(affected cells)
- **Clean output** — marching squares produces edge chains for physics
- **GPU-friendly** — density grid uploads as a texture for rendering
- **Multiplayer-friendly** — sync carving commands, not terrain state

### Grid Resolution and Subdivision

Default: **2 subcells per tile side** (4 subcells per tile). This means a carved tile is split into a 2×2 grid, each subcell evaluated by marching squares.

For a 32×32 chunk, the density grid is 64×64 = 4,096 bytes.

Higher resolutions (4 or 8 subcells per tile) can be used for finer carving detail, trading memory for precision.

### The Carving Algorithm

```
1. Identify affected tiles from the carving shape's bounding box
2. For each affected tile:
   a. If the chunk has no density grid, allocate one (fill from tile polygon)
   b. For each subcell in the density grid covered by the carving shape:
      - Sample: is the subcell centre inside the subtracted polygon?
      - If yes, set density to 0
3. Mark the chunk as dirty
4. On next physics/render update:
   a. Run marching squares on the dirty chunk's density grid
   b. Cache the resulting edge chains as collision shapes
   c. Upload the density grid as a GPU texture for rendering
```

### Initialising the Density Grid from Tile Polygons

When a tile first needs carving, its density grid is initialised:
- For each subcell corner, test if the point is inside the tile's polygon
- Corners inside the polygon get density 255, outside get 0
- This creates the initial marching squares contour matching the tile shape

This means arbitrary tile polygons (triangles, custom shapes) integrate naturally with the carving system — the density grid captures whatever shape the tile had.

## Chunks as ECS Entities

Each chunk maps to an ECS entity with components:

| Component | Purpose |
|-----------|---------|
| `ChunkPosition` | Grid coordinates `(cx, cy)` |
| `TileData` | Sparse cell map for this chunk |
| `DensityGrid` | Scalar field for carved terrain |
| `PhysicsCollider` | Cached edge chains from marching squares |
| `RenderBatch` | GPU texture or vertex buffer |
| `DirtyFlag` | Which subsystems need updates |
| `NetworkVersion` | For delta sync |

Systems iterate only chunks with `DirtyFlag` set:
- **PhysicsSystem**: regenerates collision edges via marching squares
- **RenderSystem**: uploads density texture to GPU
- **NetworkSystem**: broadcasts carving commands to peers

## Rendering

Two rendering paths, selectable per layer:

### 1. Tile sprite rendering (uncarved)

Standard tile rendering — each tile maps to a sprite from an atlas. Tiles within a chunk are batched into a single draw call (one textured quad per chunk, UVs from atlas). This is Godot's approach.

### 2. Density field rendering (carved)

When a chunk has a density grid, render the terrain via the density field:
- Upload density grid as a GPU texture (R8 format)
- A fragment shader samples the density texture and renders solid where density > threshold
- The threshold can be animated for dissolve effects
- SDF-style rendering (smooth edges) can be achieved by treating density as a distance field

Chunks can mix both: uncarved tiles render as sprites, carved regions render from the density texture.

## Physics Integration

Marching squares output is a set of edge chains — polylines describing the terrain boundary. These feed directly into a physics engine as static colliders.

**Quadrant batching** (from Godot): group tiles into physics quadrants (e.g., 8×8 tiles). Each quadrant shares a single physics body. When any tile in the quadrant changes, regenerate the quadrant's collision shape.

For carved terrain, marching squares runs on the density grid and produces edge chains for the quadrant. The edge chains are cached in the `PhysicsCollider` component and only regenerated when `DirtyFlag` is set.

## Multiplayer Sync

### Command-based replication

Send destruction commands, not terrain state:

```typescript
interface CarvingCommand {
  shape: "circle" | "polygon";
  position: Vec2;       // tilemap space
  radius?: number;      // for circles
  polygon?: Vec2[];     // for arbitrary shapes
  timestamp: number;
}
```

A carving command is a few bytes regardless of how many tiles it affects.

### Sync protocol

1. **Server-authoritative**: server validates and broadcasts carving commands
2. **Client prediction**: client applies carving locally for responsiveness, server confirms
3. **Late join**: new clients receive compressed current density grids (chunk by chunk, prioritised by proximity)
4. **Delta sync**: each chunk has a `networkVersion`. Clients track their last acknowledged version. Only chunks with newer versions are synced.

### Bandwidth

A circle carving command: `{ shape: "circle", x: float32, y: float32, radius: float32, timestamp: uint32 }` = 16 bytes.

Compare to syncing the resulting density grid change: even with RLE compression, a 64×64 grid diff is hundreds of bytes. Commands are 10-100x more bandwidth-efficient.

## Autotiling / Terrain Sets

Following Godot's terrain system:

### Terrain Sets

A terrain set groups terrain types (e.g., "ground" set containing "grass", "dirt", "stone"). Each set has a matching mode:
- **Match sides** (4 neighbours) — for simple top/side transitions
- **Match corners and sides** (8 neighbours) — for full bitmask autotiling

### Peering bits

Each tile in the TileSet has peering bits defining which terrain type is expected in each neighbouring direction. When a tile is placed, the system finds the tile variant whose peering bits match the actual neighbours.

### Lazy cache

Build a lookup cache mapping `(terrain_type, neighbour_bitmask) → tile_id`. Invalidate on TileSet changes. This avoids scanning all tiles for every placement.

## Features to Implement Later

These Godot features are architecturally accounted for but not in the initial implementation:

| Feature | Space left | Notes |
|---------|-----------|-------|
| **Navigation layers** | Per-tile navigation regions | Feeds into pathfinding |
| **Occlusion layers** | Per-tile light occluders | For 2D lighting |
| **Y-sort** | Per-tile draw order | For top-down games with depth |
| **Animated tiles** | Frame sequences in TileData | Timer-based UV cycling |
| **Alternative tiles** | Rotations/flips as variants | Already in CellData.alternativeId |
| **Scenes as tiles** | TileSetScenesCollectionSource | Tile spawns a sub-scene via SceneSpawner |
| **Custom data layers** | CustomDataLayer on TileSet | Already in TileData.customData |

## Performance Budget

| Operation | Target | Approach |
|-----------|--------|----------|
| Tile placement | < 0.1ms | HashMap insert + dirty flag |
| Carving (circle r=3) | < 1ms | ~36 subcell density writes |
| Marching squares (32×32 chunk) | < 2ms | 4096 cell lookup table |
| Chunk render upload | < 0.5ms | GPU texture sub-image update |
| Network: carving command | 16 bytes | Command, not state |
| Memory: chunk (32×32, res 2) | ~8 KB | 4 KB density + 4 KB tile data |

## Open Questions

1. **SDF rendering** — should the density grid be treated as an SDF for smooth rendering, or as a binary mask with marching squares for polygon extraction? SDF gives smoother visuals but costs more shader complexity.
2. **Chunk loading** — async loading from disk/network, or synchronous? Async prevents frame stalls but requires placeholder rendering.
3. **Carving undo** — should the original density grid be preserved for terrain regeneration effects? Storage cost is one extra grid per carved chunk.

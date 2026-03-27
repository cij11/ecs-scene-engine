# Multi-View Architecture

## Problem

The current renderer supports a single camera rendering a single view per frame. We need:

1. **Split views** — multiple cameras rendering side-by-side to the browser window (split-screen multiplayer)
2. **Nested views** — a camera renders to a texture displayed on a quad inside another scene (TV in a room, security camera feed)
3. **Recursive views** — a camera's frustum catches a quad displaying its own output (hall of mirrors, portal effects)

## Primitives

Three node-level primitives drive the entire system:

- **Camera** — captures what is in front of it. Has a `renderTarget` property: `"browser"` (writes to the browser viewport) or a texture ID string (writes to an offscreen texture).
- **RenderQuad** — displays a render target's output on a surface. References a `renderTarget` by ID. Positioned and sized by its transform like any node.
- **RenderTarget** — not a node. A property of Camera that names where the camera writes. The renderer manages the actual texture/framebuffer.

The root node always has a camera with `renderTarget: "browser"`. Everything the browser displays comes through this camera.

## Node Trees by Example

### Simple scene (current behavior)

```
rootNode
  Camera (renderTarget: "browser")
    Transform3D
  Sphere
    Transform3D
```

The root camera sees the sphere and renders to the browser.

### Split screen

```
rootNode
  Camera (renderTarget: "browser")
    Transform3D

  playerViewNode
    Transform3D          ← positioned to fill left half of root viewport
    RenderQuad (renderTarget: "player1-view")
    Camera (renderTarget: "player1-view")
      Transform3D
    Sphere
      Transform3D

  playerViewNode
    Transform3D          ← positioned to fill right half of root viewport
    RenderQuad (renderTarget: "player2-view")
    Camera (renderTarget: "player2-view")
      Transform3D
    Sphere
      Transform3D
```

Each player node has its own Camera writing to its own RenderTarget, and a RenderQuad displaying that target. The RenderQuads are positioned relative to the root camera's viewport to tile the browser window.

The root camera sees the two RenderQuads and renders them to the browser. The parent node is responsible for packing/positioning the quads — game logic adapts to actual browser dimensions.

**Optimization:** When RenderQuads fully cover the root viewport (no gaps, no 3D scene behind them), the renderer can skip the root camera pass and render the child cameras directly to screen regions via viewport scissoring. This avoids double handling — the RenderQuads are never rasterized as geometry, and the child cameras write directly to their portion of the browser framebuffer.

### TV in a scene

```
rootNode
  Camera (renderTarget: "browser")
    Transform3D
  childNode (video camera)
    Camera (renderTarget: "tv-feed")
      Transform3D
    Mesh (camera 3D model)
      Transform3D
  childNode (TV)
    Mesh (TV 3D model)
      Transform3D
    RenderQuad (renderTarget: "tv-feed")
  Sphere
    Transform3D
```

The child camera faces the sphere and writes to `"tv-feed"`. The TV's RenderQuad displays `"tv-feed"`. The root camera sees the TV (with the live feed on its screen), the camera model, and the sphere. The browser shows all of it.

This differs from split screen: the RenderQuad is positioned in **world space** (on the TV model) not in screen space.

### Hall of mirrors

```
rootNode
  Camera (renderTarget: "browser")
    Transform3D
  childNode (mirror)
    RenderQuad (renderTarget: "browser")
      Transform3D
  Sphere
    Transform3D
```

The root camera can see a RenderQuad that displays the root camera's own output. The browser shows a sphere and a mirror, which itself shows a sphere and a mirror, which shows...

**Recursion detection:** A cycle exists when a Camera can see a RenderQuad that displays that Camera's own renderTarget. The renderer detects this and resolves it by rendering iteratively from a base case:

1. Render the camera with the RenderQuad showing nothing (or previous frame's texture) → pass 1
2. Render the camera with the RenderQuad showing pass 1 → pass 2
3. Continue up to the configured `recursionDepth`

Each pass adds another layer of reflection, naturally fading with distance.

**This also applies to the TV case.** If the TV camera were facing the TV screen, the same cycle detection and iterative resolution would kick in. The trigger is always: a camera captures a RenderQuad that outputs that camera's own renderTarget.

### Nested relative positioning (split screen on a TV)

```
rootNode
  Camera (renderTarget: "browser")
    Transform3D
  childNode (TV)
    Mesh (TV 3D model)
      Transform3D
    RenderQuad (renderTarget: "game-view")
      Transform3D

  gameRootNode
    Camera (renderTarget: "game-view")
      Transform3D
    player1Node
      Transform3D          ← positioned relative to game camera viewport
      RenderQuad (renderTarget: "p1-view")
      Camera (renderTarget: "p1-view")
        Transform3D
      GameContent...
    player2Node
      Transform3D          ← positioned relative to game camera viewport
      RenderQuad (renderTarget: "p2-view")
      Camera (renderTarget: "p2-view")
        Transform3D
      GameContent...
```

Two characters playing a split-screen game on a TV in a 3D scene. The player RenderQuads tile the game camera's viewport. The game camera renders to a texture displayed on the TV's RenderQuad. The root camera sees the TV in world space.

There is nothing special about "browser space" RenderQuads. They are positioned relative to their parent, whether that parent is the browser viewport or a texture on a TV.

## Render Order

Cameras form a dependency graph based on which RenderTargets they write and which RenderQuads are visible to them.

**Algorithm:**
1. Collect all Cameras and their renderTargets
2. For each Camera, find visible RenderQuads and note which renderTargets they reference
3. Camera A depends on Camera B if A can see a RenderQuad displaying B's renderTarget
4. Topological sort: render leaf cameras first (no dependencies), then cameras that sample their output
5. Detect cycles (hall of mirrors): render iteratively up to `recursionDepth`

**Split screen** — no dependencies between player cameras. Order doesn't matter.

**Nested views** — linear dependencies. Inner cameras render first, outer cameras sample their textures.

**Recursive** — cycles broken by iterative passes from base case.

## Renderer Interface Extensions

```typescript
interface Renderer {
  // Existing methods unchanged...

  // Render target management
  createRenderTarget(id: string, width: number, height: number): void
  destroyRenderTarget(id: string): void
  setRenderTarget(id: string | null): void  // null = browser framebuffer

  // Viewport for direct-to-screen optimization
  setViewport(x: number, y: number, width: number, height: number): void
  resetViewport(): void

  // Texture binding for RenderQuad materials
  setMaterialTexture(handle: RenderHandle, textureId: string): void
}
```

## Three.js Implementation

- `createRenderTarget` → `new THREE.WebGLRenderTarget(width, height)`
- `setRenderTarget(id)` → `renderer.setRenderTarget(targets.get(id))` / `renderer.setRenderTarget(null)`
- `setViewport` → `renderer.setViewport(x, y, w, h)` + `renderer.setScissor(x, y, w, h)`
- `setMaterialTexture` → set `mesh.material.map` to the render target's `.texture`

## Render Loop

Current:
```
beginFrame → syncWorlds → endFrame (single render call)
```

New:
```
beginFrame
  syncWorlds (creates/updates all objects across all worlds)
  build camera dependency graph
  for each camera in dependency order:
    setRenderTarget (texture or null for browser)
    setActiveCamera
    render
  resetViewport
endFrame
```

## Camera Node Changes

```typescript
createNode("camera", {
  projection: "perspective" | "orthographic",
  fov?: number,
  near?: number,
  far?: number,
  zoom?: number,
  renderTarget: "browser" | string,   // NEW: where this camera writes
  recursionDepth?: number,            // NEW: for cycle resolution, default 0
  aspectRatio?: number,               // NEW: output aspect ratio (width/height)
  aspectRatioMismatch?: "stretch" | "letterbox" | "truncate",  // NEW: default "letterbox"
})
```

### Aspect Ratio Handling

Each camera has an output aspect ratio. When the destination RenderQuad's aspect ratio differs from the camera's, the `aspectRatioMismatch` property controls how the view fits:

- **`stretch`** — warp the view to fill the destination quad. Simple, but distorts the image.
- **`letterbox`** (default) — fit the view preserving aspect ratio. If width-constrained, background-colored bars above and below. If height-constrained, bars left and right.
- **`truncate`** — fill the destination preserving aspect ratio, cropping the excess. If width-constrained, fit height and crop sides. If height-constrained, fit width and crop top/bottom.

This is a Camera property, not a RenderQuad property — the camera decides how its output fits a destination.

## RenderQuad Node Type

```typescript
createNode("renderQuad", {
  renderTarget: string,     // which render target texture to display
  width: number,            // quad width in local units
  height: number,           // quad height in local units
})
```

The view sync system creates a plane mesh whose material samples the named render target texture.

## Resolution Scaling

Each camera is a full render pass. Nested views rarely need full resolution — a TV across the room doesn't need 1920x1080.

Resolution scales proportionally with nesting depth:
- Depth 0 (browser camera): full window resolution
- Depth 1 (TV in scene): e.g. 50% of parent resolution
- Depth 2 (TV showing a TV): e.g. 25%

The scaling factor is configurable per render target. In-world screens can also specify a fixed resolution (a retro TV is 320x240 regardless of window size).

Browser-space render targets (split screen quads) track window size automatically since they map directly to viewport regions.

## Dependency Graph: Visibility

For building the camera dependency graph, assume all RenderQuads in the same world are potentially visible to any camera in that world. This is conservative — it may produce unnecessary render passes for off-screen quads.

Frustum culling is an optimization, not a correctness requirement. If render passes become a bottleneck, add visibility checks later. Correctness first.

# Multi-View Architecture

## Problem

The current renderer supports a single camera rendering a single view per frame. We need:

1. **Split views** — multiple cameras rendering side-by-side to the browser window (split-screen multiplayer)
2. **Nested views** — a camera renders to a texture displayed on a quad inside another scene (TV in a room, security camera feed)
3. **Recursive views** — a camera's frustum catches a quad displaying its own output (hall of mirrors, portal effects)

## Core Concept: Every Camera Renders to a Surface

A **RenderView** pairs a camera with an output surface:

```
Camera Entity  →  RenderView  →  Surface
```

A surface is either:
- **RenderTarget** — an offscreen texture, mapped onto a quad in another scene
- **ScreenRegion** — a rectangular region of the browser viewport

All views are conceptually render textures. The browser window is just the final surface that top-level views write to.

## RenderView

```typescript
interface RenderView {
  cameraEntity: EntityId          // Entity with a camera node
  world: World                    // Which ECS world this camera lives in
  output: RenderTarget | ScreenRegion
  resolution: { width: number; height: number }
  recursionDepth?: number         // For hall-of-mirrors, default 0
}

interface RenderTarget {
  type: "texture"
  textureId: string               // Identifier for the output texture
}

interface ScreenRegion {
  type: "screen"
  x: number; y: number            // Viewport offset (0-1 normalized)
  width: number; height: number   // Viewport size (0-1 normalized)
}
```

## Render Order

Views form a dependency graph. A view that samples another view's texture must render after it.

**Algorithm:**
1. Build dependency graph: if view A's scene contains a quad displaying view B's texture, A depends on B
2. Topological sort: render leaves first, roots last
3. For each view: set viewport/render target, render, resolve

**Split screen** has no dependencies — views render independently to screen regions. Order doesn't matter.

**Nested views** have linear dependencies — the inner TV camera renders first, then the room camera renders (sampling the TV texture on a quad).

**Hall of mirrors** creates cycles. Break cycles with temporal lag: use the previous frame's texture for self-referencing views. Optionally render multiple passes up to `recursionDepth` within a single frame for higher fidelity.

## Split Screen Optimization

When child views fully cover the parent surface (as in split screen), there is nothing to be gained by rendering to intermediate textures. The child views render directly to screen regions:

```
// Two-player split screen
views: [
  { camera: player1Camera, output: { type: "screen", x: 0, y: 0, width: 0.5, height: 1 } },
  { camera: player2Camera, output: { type: "screen", x: 0.5, y: 0, width: 0.5, height: 1 } },
]
```

No parent view is needed. Each camera renders directly to its half of the browser window using viewport scissoring.

## Nested View: TV in a Scene

A room scene has a TV mesh. A second camera captures another scene. The TV mesh displays the captured texture.

```
// Security camera renders to texture
views: [
  { camera: securityCamEntity, world: corridorWorld,
    output: { type: "texture", textureId: "corridor-feed" },
    resolution: { width: 512, height: 512 } },

  { camera: roomCamEntity, world: roomWorld,
    output: { type: "screen", x: 0, y: 0, width: 1, height: 1 },
    resolution: { width: window.innerWidth, height: window.innerHeight } },
]
```

The TV quad's material references `textureId: "corridor-feed"`. The renderer resolves this to the render target texture before the room camera renders.

## Hall of Mirrors

Camera A is in a room with a mirror. The mirror is a quad displaying camera A's own output.

```
views: [
  { camera: cameraA, world: roomWorld,
    output: { type: "texture", textureId: "mirror-view" },
    resolution: { width: 1024, height: 1024 },
    recursionDepth: 3 },

  { camera: cameraA, world: roomWorld,
    output: { type: "screen", x: 0, y: 0, width: 1, height: 1 },
    resolution: { width: window.innerWidth, height: window.innerHeight } },
]
```

Rendering pass for `recursionDepth: 3`:
1. Render camera A with mirror showing nothing (or previous frame) → texture pass 1
2. Render camera A with mirror showing pass 1 → texture pass 2
3. Render camera A with mirror showing pass 2 → texture pass 3
4. Render final screen view with mirror showing pass 3

Each pass reduces the reflected image, naturally fading the recursion.

## Scene Integration

### New Node Type: RenderQuad

A scene node that displays a render target texture on a quad in 3D space.

```typescript
createNode("renderQuad", {
  textureId: "corridor-feed",   // Which render target to display
  width: 2,                     // Quad width in local units
  height: 1.5,                  // Quad height in local units
})
```

The view sync system creates a plane mesh with a material sourced from the named render target.

### Renderer Interface Extensions

```typescript
interface Renderer {
  // Existing methods unchanged...

  // New: render target management
  createRenderTarget(id: string, width: number, height: number): void
  destroyRenderTarget(id: string): void
  setRenderTarget(id: string | null): void  // null = screen

  // New: viewport for split screen
  setViewport(x: number, y: number, width: number, height: number): void
  resetViewport(): void

  // New: material texture binding
  setMaterialTexture(handle: RenderHandle, textureId: string): void
}
```

### Three.js Implementation

- `createRenderTarget` → `new THREE.WebGLRenderTarget(width, height)`
- `setRenderTarget` → `renderer.setRenderTarget(target)` / `renderer.setRenderTarget(null)`
- `setViewport` → `renderer.setViewport(x, y, w, h)` + `renderer.setScissor(x, y, w, h)`
- `setMaterialTexture` → set `mesh.material.map` to the render target's `.texture`

### Render Loop Changes

Current:
```
beginFrame → syncWorlds → endFrame (single render call)
```

New:
```
beginFrame
  → syncWorlds (creates/updates all objects across all worlds)
  → for each view in dependency order:
      setRenderTarget or setViewport
      setActiveCamera
      render
  → resetViewport
endFrame
```

## Complexity Budget

| Feature | Renderer changes | Scene changes | Sync changes |
|---------|-----------------|---------------|-------------|
| Split screen | setViewport, multi-render | None | Multi-camera tracking |
| Nested views | RenderTarget, material texture | RenderQuad node | Texture binding |
| Hall of mirrors | Multi-pass on same target | Same as nested | Recursion depth control |

Split screen is the simplest — no textures, just viewport slicing. Start there.

## Open Questions

1. **Resolution management** — should render targets auto-resize with the window, or stay fixed?
2. **View configuration** — defined in scene nodes, or configured at the application level (browser/main.ts)?
3. **Performance** — each additional view is a full render pass. Should we support resolution scaling for nested views?

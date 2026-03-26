# View Layer

## Overview

The `view/` directory is the rendering layer. It is completely agnostic to the ECS engine. The engine emits state; the view reads it and renders. The view never mutates engine state.

Views are 3D. The primary renderer is WebGPU, with an abstraction layer that allows swapping in WebGL as a fallback for browsers without WebGPU support.

This decoupling means:
- The engine can be tested without rendering
- Multiple renderers can target the same engine (WebGPU, WebGL, server-side headless)
- The rendering technology can be swapped without touching engine or game code

## Directory Structure

```
view/
├── index.ts              — public API barrel export
├── renderer.ts           — renderer interface definition (abstracts over WebGPU/WebGL)
├── scene-renderer.ts     — traverses the scene tree and delegates to renderers
├── threejs/
│   ├── index.ts          — Three.js renderer (WebGPURenderer + WebGL fallback)
│   └── ...               — Three.js scene sync, object pooling
└── components/
    ├── index.ts          — barrel export for view components
    └── ...               — view component definitions (mesh.ts, material.ts, light.ts, camera.ts)
```

## Renderer Interface

The view defines a `Renderer` interface that any rendering backend must implement:

```
// Conceptual
interface Renderer {
  init(target: HTMLElement): void
  beginFrame(): void
  endFrame(): void
  destroy(): void
}
```

The primary implementation wraps Three.js, using WebGPURenderer with automatic WebGL fallback. Three.js types are not exposed through the interface — consumers interact only with the Renderer abstraction and view components. The choice of renderer is made at bootstrap time in `browser/`.

## How the View Reads Engine State

The view imports read-only functions from `engine/index.ts`:
- `getRoot` — get the root scene to start traversal
- `getChildren` — get a scene's children
- `getComponent` / `hasComponent` — read component data from entities
- `defineQuery` — define read-only queries to find renderable entities
- `isActive` / `isSleeping` / `isStatic` — check scene state

The view does not call any engine mutation functions. It reads component data (Transform, Mesh, Material, Light, Camera, etc.) and translates it into draw calls.

## View Components

View components are component schemas that carry rendering-relevant data. They are defined in `view/components/` and registered with scenes that need visual representation.

Examples:
- **Mesh** — geometry reference, vertex data, index data
- **Material** — shader reference, colour, texture, roughness, metalness
- **Light** — type (point, directional, spot), colour, intensity, range
- **Camera** — projection (perspective/orthographic), FOV, near/far, viewport

View components are data — they describe what to render, not how. The renderer reads them and produces draw calls appropriate to its backend (WebGPU or WebGL).

### Where view components are registered

View components are registered by `game/` scene definitions, not by the view layer itself. A game's scene factory adds both engine components (Transform, Velocity) and view components (Mesh, Material, Light) to its entities. The view layer defines the schemas; the game code uses them.

## Scene Rendering Flow

Each frame:

1. **browser/** calls `view.render()`
2. **view/** calls `renderer.beginFrame()`
3. **view/** traverses the scene tree from root
4. For each scene, queries for entities with renderable components (Mesh, Light, etc.)
5. Reads Transform + renderable component data
6. Passes draw instructions to the renderer
7. **view/** calls `renderer.endFrame()`

### Render order

Scenes are rendered in tree order (depth-first). Within a scene, entities are rendered by layer (from view components), then by entity order within a layer.

Sleeping and static scenes are still rendered — they have visual state even though their ECS is not ticking. Only scenes explicitly marked as invisible are skipped.

## Import Rules

1. `view/` imports only from `engine/index.ts` — read-only functions only.
2. `view/` never imports from `game/` or `browser/`.
3. `game/` imports view component definitions from `view/components/` to register them on entities.
4. `browser/` imports from `view/index.ts` to initialise the renderer and connect it to the game loop.

## Adding a New Renderer

1. Create a new directory under `view/` (e.g. `view/webgl/`, `view/headless/`).
2. Implement the `Renderer` interface.
3. Export it from the directory's `index.ts`.
4. In `browser/`, select it at bootstrap time.

The engine, game code, and view component definitions remain unchanged.

## Adding a New View Component

1. Create a file in `view/components/`.
2. Define the schema using `defineComponent` from the engine.
3. Export from `view/components/index.ts`.
4. Use in game scene definitions to give entities visual representation.
5. Update the scene renderer to handle the new component type.

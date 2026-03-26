# View Layer

## Overview

The `view/` directory is the rendering layer. It is completely agnostic to the ECS engine. The engine emits state; the view reads it and renders. The view never mutates engine state.

This decoupling means:
- The engine can be tested without rendering
- Multiple renderers can target the same engine (Canvas 2D, WebGL, WebGPU, server-side headless)
- The rendering technology can be swapped without touching engine or game code

## Directory Structure

```
view/
├── index.ts              — public API barrel export
├── renderer.ts           — renderer interface definition
├── scene-renderer.ts     — traverses the scene tree and delegates to renderers
├── canvas2d/
│   ├── index.ts          — Canvas 2D renderer implementation
│   └── ...               — Canvas 2D specific rendering code
└── components/
    ├── index.ts          — barrel export for view components
    └── ...               — view component definitions (sprite.ts, text.ts, shape.ts)
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

Concrete renderers (Canvas 2D, WebGL, etc.) implement this interface. The choice of renderer is made at bootstrap time in `browser/`.

## How the View Reads Engine State

The view imports read-only functions from `engine/index.ts`:
- `getRoot` — get the root scene to start traversal
- `getChildren` — get a scene's children
- `getComponent` / `hasComponent` — read component data from entities
- `defineQuery` — define read-only queries to find renderable entities
- `isActive` / `isSleeping` / `isStatic` — check scene state

The view does not call any engine mutation functions. It reads component data (Transform, Sprite, Text, etc.) and translates it into draw calls.

## View Components

View components are component schemas that carry rendering-relevant data. They are defined in `view/components/` and registered with scenes that need visual representation.

Examples:
- **Sprite** — texture reference, source rect, tint, flip, layer
- **Text** — content, font, size, colour, alignment
- **Shape** — type (rect, circle, line), fill, stroke, dimensions
- **Camera** — viewport rect, zoom, target entity

View components are data — they store what to render, not how. The renderer reads them and produces draw calls appropriate to its backend.

### Where view components are registered

View components are registered by `game/` scene definitions, not by the view layer itself. A game's scene factory adds both engine components (Transform, Velocity) and view components (Sprite, Text) to its entities. The view layer defines the schemas; the game code uses them.

## Scene Rendering Flow

Each frame:

1. **browser/** calls `view.render()`
2. **view/** calls `renderer.beginFrame()`
3. **view/** traverses the scene tree from root
4. For each scene, queries for entities with renderable components (Sprite, Text, Shape, etc.)
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

1. Create a new directory under `view/` (e.g. `view/webgl/`).
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

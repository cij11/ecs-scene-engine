# Scene Tree Architecture

## Overview

A game is composed of scenes arranged in a tree. Each scene is a World with its own ECS. The architecture is inspired by Godot's scene tree, adapted for a TypeScript ECS context.

## Scene

A scene is the fundamental unit of composition. Everything in the game is a scene — a player character, a UI panel, a level, a particle emitter, a text label.

A scene contains:
- **World** — its own ECS instance (entities, components, systems, queries)
- **Children** — an ordered list of child scenes
- **Parent** — a reference to the parent scene (null for the root)
- **State** — lifecycle state (created, active, sleeping, destroyed)

## Tree Structure

The scene tree is a rooted tree. The root scene is created at game startup. All other scenes are descendants.

```
Game (root scene)
├── MainMenu (scene)
│   ├── Title (scene)
│   └── StartButton (scene)
└── Level1 (scene)
    ├── Player (scene)
    │   ├── Sprite (scene)
    │   └── Hitbox (scene)
    ├── Enemy (scene)
    └── UI (scene)
        ├── HealthBar (scene)
        └── ScoreLabel (scene)
```

Scenes can be added to and removed from the tree at runtime. A scene can be moved from one parent to another.

## Communication: Signal Up, Call Down

Scenes communicate in two directions:

### Signals (up and sideways)

A scene emits signals to notify its parent and siblings of events. Signals are fire-and-forget. The emitting scene does not know or care who is listening.

- A scene declares the signals it can emit.
- Parent scenes (or siblings) connect handlers to those signals.
- Signals do not automatically bubble up the tree. A parent must explicitly re-emit if propagation is needed.
- Signals can carry typed payloads.

```
// Conceptual
Player emits "damaged" { amount: 10 }
  → Level1 is connected, updates game state
  → UI.HealthBar is connected, updates display
```

### Calls (down)

A parent scene calls methods on its children to direct them. This is a direct invocation — the parent knows about its children.

- A scene exposes a typed interface of callable methods.
- Parents invoke these methods on their children.
- Calls are always parent-to-child, never child-to-parent.

```
// Conceptual
Level1 calls Player.respawn(spawnPoint)
Level1 calls UI.showMessage("Game Over")
```

### Why this asymmetry?

- **Signals up**: children don't depend on their parent's type. A Player scene works the same whether it's in Level1 or a TestHarness.
- **Calls down**: parents know their children's interfaces. This is safe because parents compose their children explicitly.

## Scene Lifecycle

### States

1. **Created** — scene is instantiated but not in the tree. World exists but is not ticking.
2. **Entering** — scene is being added to the tree. Propagates top-down (parent enters before children).
3. **Ready** — scene and all its descendants are in the tree. Propagates bottom-up (children are ready before parent). This is where initialisation that depends on child scenes should happen.
4. **Active** — scene is in the tree and its ECS is ticking (if it has game logic).
5. **Sleeping** — scene is in the tree but its ECS is not ticking. See lazy ECS strategy (task-ESE-0001-03).
6. **Exiting** — scene is being removed from the tree. Propagates bottom-up (children exit before parent).
7. **Destroyed** — scene is removed from the tree and cleaned up.

### Lifecycle hooks

Each scene can respond to lifecycle transitions:

- **onEnterTree** — called when the scene is added to the tree (top-down)
- **onReady** — called when the scene and all descendants are in the tree (bottom-up)
- **onExitTree** — called when the scene is removed from the tree (bottom-up)
- **onSleep** — called when the scene transitions to sleeping
- **onWake** — called when the scene transitions from sleeping to active

## Scene Composition

### Prefab scenes

A scene can be defined as a reusable template (prefab). Instantiating a prefab creates a deep copy of the scene and its descendants. Once instantiated, the copy is a regular scene in the tree — there is no live link back to the prefab definition.

### Scene files

Scenes can be serialised to and loaded from files. A scene file captures:
- The scene's components and their initial values
- The scene's child tree (recursively)
- Signal connections between the scene and its children

### Composition pattern

Games are built by composing scenes:

1. Define leaf scenes (Sprite, Hitbox, TextLabel)
2. Compose them into functional scenes (Player = Sprite + Hitbox + PlayerController)
3. Compose those into level scenes (Level1 = Player + Enemies + UI)
4. The root scene manages top-level transitions (MainMenu → Level1 → Level2)

## Processing Order

Scene ECS ticking is not a tree traversal. Active scenes are registered in a flat processing list, sorted by priority. This allows explicit control over execution order independent of tree depth.

Priority is an integer. Lower values run first. Scenes at the same priority run in tree order (depth-first).

## Deferred Operations

Tree modifications (adding/removing scenes, destroying entities) during a tick are deferred. They are applied at the end of the current tick, after all systems have run. This prevents mutation during iteration.

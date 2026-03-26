# Sprint 1 Demo — Architect Project

**Date:** 2026-03-26
**Sprint:** sprint_1_2026_03_25
**Ticket:** task-ESE-0001 (8 subtasks, 8 points)
**Outcome:** All 8 subtasks completed

## Key Features Presented

### 1. ECS Core Abstractions (task-ESE-0001-01)
- Defined World, Entity, Component, System, Query
- Core vs extension components and systems
- SoA storage layout, bitmask membership, pipeline phases
- Future WASM/shader offloading path for core systems

### 2. Scene Tree Architecture (task-ESE-0001-02)
- Godot-inspired scene tree where everything is a scene
- Each scene is a World with its own ECS
- Signal up / call down communication model
- Scene lifecycle: created → entering → ready → active/sleeping → exiting → destroyed

### 3. Lazy ECS Strategy (task-ESE-0001-03)
- Three scene modes: active, static, sleeping
- Cascade sleep/wake with state preservation
- Wake triggers (signal, timer, proximity)
- Performance model: active (tens–hundreds), static/sleeping (thousands)

### 4. Engine Module Structure (task-ESE-0001-04)
- engine/ directory layout with ecs/, scene/, core-components/, core-systems/, pipeline/, serialisation/
- Public API surface segmented for game/, view/, browser/
- Clear internal vs external boundaries

### 5. Game Module Structure (task-ESE-0001-05)
- game/ extends engine via extension components and systems
- Scene factory functions, prefabs, config
- Import rules: game/ only imports from engine/index.ts

### 6. View Layer (task-ESE-0001-06)
- Completely decoupled from ECS — engine emits state, view reads and renders
- Renderer interface for swappable backends (Canvas 2D, WebGL, WebGPU)
- View components defined in view/, registered by game/

### 7. Serialisation Layer (task-ESE-0001-07)
- Single format for networking and persistence
- Full snapshot, delta, and filtered modes
- Schema registry for cross-build compatibility

### 8. Build Tooling (task-ESE-0001-08)
- Vite for bundling and dev server
- Vitest for testing
- npm scripts: dev, build, test, test:watch

## QA Outcomes

| Area | Result |
|------|--------|
| Architecture docs reviewed | All 8 docs in docs/ — consistent, no contradictions |
| Module boundaries | engine/ → game/ → view/ → browser/ dependency chain is clean |
| Directory structure matches docs | Verified — engine/ecs/ created, browser/index.html serves correctly |
| Build pipeline | `npm run build` produces working bundle |
| Test pipeline | `npm test` runs vitest successfully |
| Dev server | `npm run dev` serves on port 3000 |

## Stakeholder Q&A

_(Retroactive demo — no live Q&A session held)_

## Artifacts

- [docs/ecs-core-abstractions.md](../../../../docs/ecs-core-abstractions.md)
- [docs/scene-tree-architecture.md](../../../../docs/scene-tree-architecture.md)
- [docs/lazy-ecs-strategy.md](../../../../docs/lazy-ecs-strategy.md)
- [docs/engine-module-structure.md](../../../../docs/engine-module-structure.md)
- [docs/game-module-structure.md](../../../../docs/game-module-structure.md)
- [docs/view-layer.md](../../../../docs/view-layer.md)
- [docs/serialisation-layer.md](../../../../docs/serialisation-layer.md)
- [docs/build-and-test.md](../../../../docs/build-and-test.md)

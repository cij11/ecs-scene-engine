# Build Tooling and Test Framework

## Toolchain

| Concern | Tool | Config |
|---------|------|--------|
| Bundler + dev server | Vite | `vite.config.ts` |
| Test framework | Vitest | `vitest.config.ts` |
| TypeScript execution (scripts) | tsx | — |
| TypeScript type checking | tsc | `tsconfig.json` |

Vite and Vitest share the same underlying pipeline. One config philosophy, one set of transforms.

## npm Scripts

| Command | Description |
|---------|-------------|
| `npm run dev` | Start Vite dev server (port 3000) with hot reload |
| `npm run build` | Production build to `dist/` |
| `npm test` | Run all tests once |
| `npm run test:watch` | Run tests in watch mode |

## Configuration

### vite.config.ts

- Root is `browser/` — Vite serves `browser/index.html` as the entry point
- Build output goes to `dist/` at project root
- Dev server runs on port 3000

### vitest.config.ts

- Test files are discovered in `engine/`, `game/`, and `view/`
- Test file pattern: `**/*.test.ts`

### tsconfig.json

- Target: ESNext
- Module: NodeNext
- Strict mode enabled
- Includes: `engine/`, `game/`, `browser/`, `tooling/`

## Test Conventions

- **Unit tests** for low-level logic (ECS operations, queries, component storage). Co-located with source: `engine/ecs/world.test.ts` alongside `engine/ecs/world.ts`.
- **Integration tests** for high-level logic (scene tree operations, system pipelines). Co-located with the module under test.
- **Realtime tests** for gameplay scenarios — run the simulation for N ticks and assert on state. Located alongside the game code in `game/`.

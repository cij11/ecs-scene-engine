# Inter-ECS Communication

## Overview

A game may have multiple ECS worlds in a hierarchy — a space simulation containing a ship interior simulation, for example. These worlds are decoupled: they do not directly access each other's data. Communication between ECS worlds flows through a port/request system.

## Principles

1. **Parent is authoritative.** The parent ECS has authority over child ECS instances. It can issue direct commands downward.
2. **Root-to-leaf resolution.** ECS worlds tick in order from root to leaves. The parent has already committed its state before children process.
3. **Request/response for upward communication.** Child ECS instances cannot directly mutate parent state. They register requests on ports, which the parent evaluates on its next tick.
4. **Eventual consistency.** Requests may take 1–2 ticks to resolve. This is acceptable — the game designer handles the transition (animations, loading screens, "airlock cycling" states).

## Downward Communication (Parent → Child)

The parent ECS writes commands directly into the child ECS via a core component: `ComponentCRUDEntity`.

`ComponentCRUDEntity` holds:
- A queue of entities to create (with initial component data)
- A queue of entities to destroy

When the child ECS ticks (after the parent), it processes the CRUD queue first, before running its own systems.

### Example: Astronaut enters ship

```
Frame N — Space ECS ticks:
  1. Astronaut entity reaches spaceship airlock
  2. Space ECS requests entry via port on ShipInterior

Frame N+1 — Space ECS ticks:
  1. Reads port response from ShipInterior: "entry_ok"
  2. Removes astronaut entity from Space ECS
  3. Writes to ShipInterior's ComponentCRUDEntity:
     create: { scene: "astronaut", position: [airlock_x, airlock_y, 0], health: 85 }

Frame N+1 — ShipInterior ECS ticks (after Space):
  1. Processes CRUD queue: creates astronaut entity at airlock position
  2. Runs interior systems (physics, AI, etc.)
```

## Upward Communication (Child → Parent)

Child ECS instances communicate upward via **ports**. A port is a pair of core components:

### PortOut (on the child)

Holds outbound requests from the child to the parent:

```
PortOut: {
  requests: [
    { id: "req_001", type: "spawn_astronaut", data: { position, health, inventory } }
  ]
}
```

### PortIn (on the parent, per child)

Holds inbound requests from a specific child, plus responses to send back:

```
PortIn: {
  requests: [
    { id: "req_001", type: "spawn_astronaut", data: { position, health, inventory } }
  ],
  responses: [
    { id: "req_000", status: "ok", data: { entityId: 42 } }
  ]
}
```

### Request lifecycle

```
Child ECS                              Parent ECS
─────────                              ──────────

1. Child writes request to PortOut
                            ──────►
2. Parent ticks, reads PortIn
   Evaluates request (game logic)
   Writes response to PortIn.responses
                            ◄──────
3. Child ticks, reads PortOut.responses
   Handles success or failure
```

### Example: Astronaut leaves ship

```
Frame N — ShipInterior ECS ticks:
  1. Astronaut reaches airlock, player triggers "exit ship"
  2. Interior writes to PortOut:
     { type: "exit_astronaut", data: { health: 85, inventory: [...] } }

Frame N+1 — Space ECS ticks:
  1. Reads ShipInterior's PortIn
  2. Evaluates: is space outside the airlock clear? Yes.
  3. Creates astronaut entity in Space ECS at spaceship's airlock world position
  4. Writes response: { status: "ok" }

Frame N+1 — ShipInterior ECS ticks:
  1. Reads response: "ok"
  2. Destroys interior astronaut entity
```

### Handling rejection

```
Frame N — ShipInterior ECS ticks:
  1. Astronaut tries to exit, writes port request

Frame N+1 — Space ECS ticks:
  1. Evaluates: space outside airlock is blocked (debris, enemy)
  2. Writes response: { status: "rejected", reason: "airlock_blocked" }

Frame N+1 — ShipInterior ECS ticks:
  1. Reads response: "rejected"
  2. Game logic handles failure (astronaut stays, show "airlock blocked" message)
```

## Sibling Communication

Sibling ECS instances (e.g. two ships) cannot communicate directly. Communication routes through the shared parent:

```
ShipA → PortOut → Parent reads → Parent evaluates → Parent writes to ShipB's CRUD
```

The parent orchestrates all cross-child interactions. This keeps each ECS world decoupled and the authority model clean.

## Signals (Broadcasting Events)

Ports handle command flow. Signals handle event broadcasting.

A signal is a fire-and-forget notification: "an astronaut just left the ship." Any interested party (sibling scenes, grandparent scenes, HUD) can listen. The emitter doesn't know or care who is listening.

Signals propagate upward through the ECS hierarchy. A parent can re-emit a child's signal if it should propagate further.

Use signals for:
- UI updates ("health_changed", "score_updated")
- Audio triggers ("explosion", "door_opened")
- Analytics events
- Any case where the emitter shouldn't know about the receivers

Use ports for:
- Entity transfer between worlds
- State-changing requests that can succeed or fail
- Any case where the response matters

## Core Components

The inter-ECS communication system uses these core components:

| Component | Location | Purpose |
|-----------|----------|---------|
| `ComponentCRUDEntity` | engine/ | Queue of entity create/destroy commands |
| `PortOut` | engine/ | Outbound requests from child to parent |
| `PortIn` | engine/ | Inbound requests + responses, one per child |
| `SignalEmitter` | engine/ | Outbound signals |
| `SignalListener` | engine/ | Signal subscriptions |

These are all core components — provided by the engine, not the game. The game defines extension components that specify the *meaning* of requests and signals (what data an astronaut carries, what "exit_astronaut" means, what to do on rejection).

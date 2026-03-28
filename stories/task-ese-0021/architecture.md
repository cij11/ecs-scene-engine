# Physics Engine Integration Architecture

How an off-the-shelf physics engine (Rapier recommended) integrates with our ECS scene engine.

---

## System Diagram

```
+-----------------------------------------------------------------------------------+
|                              ECS World (per-scene)                                |
|                                                                                   |
|  Components (SoA TypedArrays)                                                     |
|  +-------------+  +-------------+  +---------------+  +------------------------+ |
|  | Transform   |  | Velocity    |  | RigidBody     |  | Collider               | |
|  |-------------|  |-------------|  |---------------|  |------------------------| |
|  | position.x  |  | linear.x   |  | bodyType      |  | shapeType              | |
|  | position.y  |  | linear.y   |  | mass          |  | halfExtents / radius   | |
|  | position.z  |  | linear.z   |  | restitution   |  | friction               | |
|  | rotation.x  |  | angular.x  |  | friction      |  | isSensor               | |
|  | rotation.y  |  | angular.y  |  | linearDamping |  | collisionGroup         | |
|  | rotation.z  |  | angular.z  |  | angularDamping|  | collisionMask          | |
|  | rotation.w  |  | angular.z  |  | ccdEnabled    |  | physicsHandle (opaque) | |
|  | scale.x/y/z |  +-------------+  | sleeping      |  +------------------------+ |
|  +-------------+                    | physicsHandle |                              |
|                                     | (opaque u32)  |                              |
|                                     +---------------+                              |
|                                                                                   |
|  +------------------+  +-------------------+  +------------------------------+    |
|  | CollisionEvents  |  | ContactManifold   |  | ParticleEmitter              |    |
|  |------------------|  |-------------------|  |------------------------------|    |
|  | entityA          |  | entityA           |  | count, lifetime, velocity    |    |
|  | entityB          |  | entityB           |  | spread, gravity, color       |    |
|  | type (enter/     |  | normal.x/y/z      |  | (handled by GPU compute,     |    |
|  |  stay/exit)      |  | depth             |  |  NOT by physics engine)      |    |
|  | timestamp        |  | impulse           |  +------------------------------+    |
|  +------------------+  +-------------------+                                      |
+-----------------------------------------------------------------------------------+
        |                       |                              |
        v                       v                              v
+-------------------+  +--------------------+  +---------------------------+
| PhysicsSystem     |  | CollisionSystem    |  | ParticleComputeSystem     |
| (CPU - Rapier)    |  | (CPU - ECS)        |  | (GPU - WebGPU Compute)    |
+-------------------+  +--------------------+  +---------------------------+
        |                       |                              |
        v                       v                              v
+-------------------+  +--------------------+  +---------------------------+
| Rapier World      |  | Game Logic         |  | GPU Compute Pipeline      |
| (WASM heap)       |  | (collision         |  | (particle update kernel,  |
|                   |  |  response handlers)|  |  spatial hash, etc.)      |
+-------------------+  +--------------------+  +---------------------------+
```

---

## PhysicsSystem: The Bridge Between ECS and Rapier

The PhysicsSystem is an ECS System that owns a Rapier `World` instance and synchronizes state between ECS components and the physics simulation.

### Lifecycle

```
PhysicsSystem.init()
  |
  +-- Create Rapier World (gravity, timestep config)
  +-- Register collision event handler
  +-- Query all entities with [RigidBody, Transform] -> create Rapier bodies
  +-- Query all entities with [Collider] -> attach Rapier colliders

PhysicsSystem.update(dt)
  |
  +-- 1. SYNC ECS -> PHYSICS  (write phase)
  |     For entities where ECS is authoritative (kinematic bodies, teleports):
  |       - Read Transform component
  |       - Write position/rotation to Rapier body via handle
  |     For entities with pending force/impulse commands:
  |       - Apply forces to Rapier body
  |
  +-- 2. STEP PHYSICS
  |     - rapierWorld.step()
  |     - Fixed timestep with accumulator (e.g., 1/60s)
  |     - Rapier handles broadphase, narrowphase, solver internally
  |
  +-- 3. SYNC PHYSICS -> ECS  (read phase)
  |     For all dynamic bodies:
  |       - Read position/rotation from Rapier body
  |       - Write to Transform component
  |       - Read linear/angular velocity from Rapier body
  |       - Write to Velocity component
  |
  +-- 4. DRAIN COLLISION EVENTS
        - Read collision events from Rapier event queue
        - Write to CollisionEvents component buffer
        - Downstream systems (CollisionSystem) process these

PhysicsSystem.onEntityAdded(entity)
  |
  +-- Create Rapier body + collider from components
  +-- Store handle in RigidBody.physicsHandle / Collider.physicsHandle

PhysicsSystem.onEntityRemoved(entity)
  |
  +-- Remove Rapier body/collider via stored handle
  +-- Rapier automatically cleans up joints attached to removed bodies
```

### Handle Mapping

```
Entity-to-Physics mapping (bidirectional):

  entityToHandle: Map<EntityId, RigidBodyHandle>
  handleToEntity: Map<RigidBodyHandle, EntityId>

  - Created when entity gains RigidBody component
  - Destroyed when entity loses RigidBody component or is despawned
  - The physicsHandle field on RigidBody/Collider components stores
    the raw u32 handle for fast lookup without Map overhead
```

---

## Collision Event Flow

```
Rapier World (WASM)                    ECS World
===================                    =========

narrowphase detects            1. Rapier queues event internally
contact between                   (body handles + event type)
body A and body B
        |
        v
PhysicsSystem.update()         2. After world.step(), drain event queue:
drains events                     rapierWorld.contactsWith(colliderA, |manifold| {
        |                           write to CollisionEvents buffer
        v                        })
CollisionEvents buffer         3. Events stored as ECS component data:
populated                         { entityA, entityB, type, normal, depth }
        |
        v
CollisionSystem.update()       4. Queries [CollisionEvents] and dispatches:
processes events                  - Entity signals (onCollisionEnter, etc.)
        |                        - Game logic (damage, scoring, triggers)
        v                        - Sound/VFX triggers
Game systems react             5. CollisionEvents buffer cleared at end of frame
```

### Event Types

| Rapier Event | ECS CollisionEvent.type | When |
|---|---|---|
| `collisionStart` | `enter` | Two colliders begin touching |
| Active contact | `stay` | Colliders remain in contact (opt-in, perf cost) |
| `collisionEnd` | `exit` | Two colliders separate |
| Sensor overlap start | `sensorEnter` | Entity enters a trigger volume |
| Sensor overlap end | `sensorExit` | Entity leaves a trigger volume |

---

## Coexistence: Physics Engine + GPU Compute Pipeline

The physics engine and GPU compute pipeline serve different roles and operate independently.

```
+-----------------------------------------------------------------------+
|                         System Execution Order                        |
|                                                                       |
|  1. InputSystem          (read input, set forces/velocities)          |
|  2. PhysicsSystem        (CPU/WASM - rigid body sim, Rapier)          |
|  3. CollisionSystem      (CPU - process collision events)             |
|  4. GameLogicSystems     (CPU - health, scoring, AI, etc.)            |
|  5. ParticleComputeSystem(GPU - particle update via compute shader)   |
|  6. SpatialQuerySystem   (GPU - broadphase for non-physics queries)   |
|  7. RenderSystem         (GPU - draw call submission)                 |
+-----------------------------------------------------------------------+

Physics Engine (Rapier)              GPU Compute Pipeline
=======================              ====================
Rigid body dynamics                  Particle simulation (millions)
Collision detection + response       Spatial hashing / queries
Joints and constraints               Flocking / boid behavior
Character controllers                Cloth / hair (non-rigid)
Raycasting                           Procedural animation
                                     Any embarrassingly-parallel workload

Data flow:
  - PhysicsSystem writes Transform -> ParticleComputeSystem reads Transform
    (e.g., particle emitter follows a rigid body)
  - CollisionSystem triggers -> ParticleComputeSystem spawns
    (e.g., impact creates particle burst)
  - No direct Rapier <-> GPU data transfer needed
  - ECS components are the shared data layer
```

### Why Keep Both?

1. **Rigid body physics does not parallelize well on GPU**. Constraint solvers are iterative and sequential. CPU engines (with SIMD + islands) are faster for this workload than GPU compute approaches.

2. **Particle physics is embarrassingly parallel**. Millions of independent particles with simple update rules (position += velocity * dt) are ideal for GPU compute. A CPU physics engine would choke on this volume.

3. **Different data ownership patterns**:
   - Rigid bodies: small count (hundreds), complex interactions, CPU-authoritative
   - Particles: massive count (millions), simple rules, GPU-authoritative (data stays on GPU, only rendered -- never read back to CPU)

4. **No data transfer bottleneck**. The two systems communicate through ECS components (emitter positions, spawn triggers), not by passing physics state between CPU and GPU every frame.

---

## Component Design for Rapier Integration

### Minimal Component Set

```typescript
// RigidBody -- one per physics-simulated entity
defineComponent('RigidBody', {
  bodyType: Types.ui8,        // 0=dynamic, 1=static, 2=kinematicPosition, 3=kinematicVelocity
  mass: Types.f32,
  restitution: Types.f32,     // bounciness [0,1]
  friction: Types.f32,        // surface friction [0,1]
  linearDamping: Types.f32,   // air resistance (linear)
  angularDamping: Types.f32,  // air resistance (angular)
  gravityScale: Types.f32,    // per-body gravity multiplier
  ccdEnabled: Types.ui8,      // continuous collision detection
  canSleep: Types.ui8,        // allow sleeping optimization
  _handle: Types.ui32,        // opaque Rapier RigidBodyHandle (internal)
});

// Collider -- one or more per physics entity (compound shapes)
defineComponent('Collider', {
  shapeType: Types.ui8,       // 0=box, 1=sphere, 2=capsule, 3=cylinder, 4=convexHull, 5=trimesh
  halfExtentX: Types.f32,     // box half-widths / sphere radius in [0] / capsule radius+halfHeight
  halfExtentY: Types.f32,
  halfExtentZ: Types.f32,
  offsetX: Types.f32,         // local offset from entity origin (for compound shapes)
  offsetY: Types.f32,
  offsetZ: Types.f32,
  isSensor: Types.ui8,        // trigger volume (no physics response)
  collisionGroup: Types.ui32, // bitmask for collision filtering
  collisionMask: Types.ui32,  // bitmask for what this collider interacts with
  _handle: Types.ui32,        // opaque Rapier ColliderHandle (internal)
});

// Existing Transform and Velocity components are reused as-is.
// PhysicsSystem reads/writes them. No physics-specific transform needed.
```

### What Lives in Rapier vs ECS

| Data | Lives in | Why |
|---|---|---|
| Position, rotation | ECS (Transform) | Authoritative. Rapier writes here after step. |
| Linear/angular velocity | ECS (Velocity) | Readable by game systems. Rapier writes after step. |
| Body type, mass, damping | ECS (RigidBody) | Configuration. Synced to Rapier on change. |
| Shape geometry | ECS (Collider) | Configuration. Synced to Rapier on creation. |
| Contact graph, islands | Rapier only | Internal solver state. No ECS representation needed. |
| Broadphase acceleration | Rapier only | Internal optimization. |
| Collision events | ECS (CollisionEvents) | Drained from Rapier, consumed by game systems. |

---

## Integration with Scene Tree

Per the project architecture, ECS worlds form a hierarchy and only simulation-heavy parts use ECS.

```
SceneTree
  +-- UIScene (no ECS, static nodes only)
  +-- GameScene
        +-- NodeECS: PhysicsWorld
        |     Components: Transform, Velocity, RigidBody, Collider, CollisionEvents
        |     Systems: PhysicsSystem, CollisionSystem, GameLogicSystems
        |     -> Owns one Rapier World instance
        |
        +-- NodeECS: ParticleWorld
              Components: Transform, ParticleEmitter, ParticleBuffer
              Systems: ParticleComputeSystem
              -> Owns GPU compute pipelines, no Rapier
```

Each NodeECS world that needs physics creates its own Rapier World. This provides:
- **Isolation**: Physics in one world cannot affect another
- **Performance**: Smaller worlds = fewer bodies = faster simulation
- **Cleanup**: Destroying the ECS world destroys the Rapier world (no leak)

Inter-world physics (e.g., a projectile crossing world boundaries) is handled via the port system: the source world sends a CRUD command to spawn the entity in the target world.

---

## Fixed Timestep Strategy

```
const PHYSICS_DT = 1 / 60;  // 60 Hz fixed step
let accumulator = 0;

PhysicsSystem.update(frameDt) {
  accumulator += frameDt;

  while (accumulator >= PHYSICS_DT) {
    syncEcsToPhysics();       // kinematic bodies, forces
    rapierWorld.step();        // fixed step
    syncPhysicsToEcs();        // dynamic body results
    drainCollisionEvents();    // populate ECS event buffer
    accumulator -= PHYSICS_DT;
  }

  // Optional: interpolate Transform for rendering smoothness
  // alpha = accumulator / PHYSICS_DT;
  // renderTransform = lerp(previousTransform, currentTransform, alpha)
}
```

Rapier's built-in integration timestep is used. The accumulator pattern ensures physics runs at a consistent rate regardless of frame rate, preventing instability at low FPS and wasted work at high FPS.

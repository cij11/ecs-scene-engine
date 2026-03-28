import RAPIER from "@dimforge/rapier3d-deterministic";

export interface RapierWorld {
  raw: RAPIER.World;
}

export interface RapierBody {
  raw: RAPIER.RigidBody;
}

/**
 * Create a Rapier physics world.
 * The deterministic build does not require async WASM init.
 */
export function createRapierWorld(
  gravity: { x: number; y: number; z: number } = { x: 0, y: -9.81, z: 0 },
): RapierWorld {
  const world = new RAPIER.World(new RAPIER.Vector3(gravity.x, gravity.y, gravity.z));
  return { raw: world };
}

/**
 * Add a rigid body with a ball collider to the world.
 */
export function addRigidBody(
  world: RapierWorld,
  opts: {
    position: { x: number; y: number; z: number };
    radius: number;
    bodyType: "dynamic" | "fixed" | "kinematic";
    restitution: number;
    mass?: number;
  },
): RapierBody {
  let bodyDesc: RAPIER.RigidBodyDesc;
  switch (opts.bodyType) {
    case "fixed":
      bodyDesc = RAPIER.RigidBodyDesc.fixed();
      break;
    case "kinematic":
      bodyDesc = RAPIER.RigidBodyDesc.kinematicPositionBased();
      break;
    case "dynamic":
    default:
      bodyDesc = RAPIER.RigidBodyDesc.dynamic();
      break;
  }

  bodyDesc.setTranslation(opts.position.x, opts.position.y, opts.position.z);

  const rigidBody = world.raw.createRigidBody(bodyDesc);

  const colliderDesc = RAPIER.ColliderDesc.ball(opts.radius).setRestitution(opts.restitution);

  if (opts.mass !== undefined) {
    colliderDesc.setMass(opts.mass);
  }

  world.raw.createCollider(colliderDesc, rigidBody);

  return { raw: rigidBody };
}

/**
 * Step the physics world forward by dt seconds.
 */
export function stepWorld(world: RapierWorld, _dt: number): void {
  world.raw.step();
}

/**
 * Read the current translation of a rigid body.
 */
export function getBodyPosition(body: RapierBody): { x: number; y: number; z: number } {
  const t = body.raw.translation();
  return { x: t.x, y: t.y, z: t.z };
}

/**
 * Free the world and all its bodies/colliders.
 */
export function destroyWorld(world: RapierWorld): void {
  world.raw.free();
}

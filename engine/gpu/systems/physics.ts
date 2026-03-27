/**
 * GPU multi-pass physics system.
 *
 * 4-pass pipeline in a single command encoder submission:
 *   1. Clear spatial grid
 *   2. Populate grid with entity positions (spatial hash)
 *   3. Narrowphase collision detection + impulse response
 *   4. Integration (Verlet with force/impulse/teleport consumption)
 *
 * See architecture.md section 8.
 * References: Unity GPU Physics, GPU Gems Ch.32.
 */

// ---------------------------------------------------------------------------
// WGSL sources for each pass
// ---------------------------------------------------------------------------

export const GRID_SIZE = 32; // cells per axis (was 64 — 32³ = 32K cells vs 262K)
export const MAX_PER_CELL = 4; // max entities per grid cell
const TOTAL_CELLS = GRID_SIZE * GRID_SIZE * GRID_SIZE;

/** Pass 1: Clear the spatial grid to -1 (empty). */
export const clearGridWgsl = `
struct Params {
  totalCells: u32,
};

@group(0) @binding(0) var<uniform> params: Params;
@group(0) @binding(1) var<storage, read_write> grid: array<i32>;

@compute @workgroup_size(64)
fn main(@builtin(global_invocation_id) id: vec3u) {
  let cellBase = id.x * ${MAX_PER_CELL}u;
  if (cellBase >= params.totalCells * ${MAX_PER_CELL}u) { return; }
  for (var i = 0u; i < ${MAX_PER_CELL}u; i++) {
    grid[cellBase + i] = -1;
  }
}
`;

/** Pass 2: Populate grid — hash each entity's position into a cell. */
export const populateGridWgsl = `
struct Params {
  gridSize: u32,
  cellSize: f32,
  gridOrigin: f32,
};

@group(0) @binding(0) var<uniform> params: Params;
@group(0) @binding(1) var<storage, read_write> grid: array<atomic<i32>>;
@group(0) @binding(2) var<storage, read> indices: array<u32>;
@group(0) @binding(3) var<storage, read> px: array<f32>;
@group(0) @binding(4) var<storage, read> py: array<f32>;
@group(0) @binding(5) var<storage, read> pz: array<f32>;

fn gridIndex(x: i32, y: i32, z: i32) -> u32 {
  let gs = i32(params.gridSize);
  let cx = clamp(x, 0, gs - 1);
  let cy = clamp(y, 0, gs - 1);
  let cz = clamp(z, 0, gs - 1);
  return u32(cx + cy * gs + cz * gs * gs);
}

@compute @workgroup_size(64)
fn main(@builtin(global_invocation_id) id: vec3u) {
  if (id.x >= arrayLength(&indices)) { return; }
  let eid = indices[id.x];

  let gx = i32(floor((px[eid] - params.gridOrigin) / params.cellSize));
  let gy = i32(floor((py[eid] - params.gridOrigin) / params.cellSize));
  let gz = i32(floor((pz[eid] - params.gridOrigin) / params.cellSize));

  let cell = gridIndex(gx, gy, gz);
  let base = cell * ${MAX_PER_CELL}u;

  // Atomic insert — try each slot
  for (var i = 0u; i < ${MAX_PER_CELL}u; i++) {
    let old = atomicCompareExchangeWeak(&grid[base + i], -1, i32(eid));
    if (old.exchanged) { break; }
  }
}
`;

/** Pass 3: Narrowphase — check 27 neighboring cells for sphere-sphere collisions. */
export const collisionWgsl = `
struct Params {
  gridSize: u32,
  cellSize: f32,
  gridOrigin: f32,
};

@group(0) @binding(0) var<uniform> params: Params;
@group(0) @binding(1) var<storage, read> grid: array<i32>;
@group(0) @binding(2) var<storage, read> indices: array<u32>;
@group(0) @binding(3) var<storage, read_write> px: array<f32>;
@group(0) @binding(4) var<storage, read_write> py: array<f32>;
@group(0) @binding(5) var<storage, read_write> pz: array<f32>;
@group(0) @binding(6) var<storage, read> radius: array<f32>;
@group(0) @binding(7) var<storage, read> restitution: array<f32>;
@group(0) @binding(8) var<storage, read_write> vx: array<f32>;
@group(0) @binding(9) var<storage, read_write> vy: array<f32>;
@group(0) @binding(10) var<storage, read_write> vz: array<f32>;

fn gridIndex(x: i32, y: i32, z: i32) -> u32 {
  let gs = i32(params.gridSize);
  let cx = clamp(x, 0, gs - 1);
  let cy = clamp(y, 0, gs - 1);
  let cz = clamp(z, 0, gs - 1);
  return u32(cx + cy * gs + cz * gs * gs);
}

@compute @workgroup_size(64)
fn main(@builtin(global_invocation_id) id: vec3u) {
  if (id.x >= arrayLength(&indices)) { return; }
  let eid = indices[id.x];

  let posA = vec3f(px[eid], py[eid], pz[eid]);
  let radA = radius[eid];

  let gx = i32(floor((posA.x - params.gridOrigin) / params.cellSize));
  let gy = i32(floor((posA.y - params.gridOrigin) / params.cellSize));
  let gz = i32(floor((posA.z - params.gridOrigin) / params.cellSize));

  // Check 27 neighboring cells
  for (var dx = -1; dx <= 1; dx++) {
    for (var dy = -1; dy <= 1; dy++) {
      for (var dz = -1; dz <= 1; dz++) {
        let cell = gridIndex(gx + dx, gy + dy, gz + dz);
        let base = cell * ${MAX_PER_CELL}u;

        for (var i = 0u; i < ${MAX_PER_CELL}u; i++) {
          let other = grid[base + i];
          if (other < 0) { break; }
          let oid = u32(other);
          if (oid == eid) { continue; }

          let posB = vec3f(px[oid], py[oid], pz[oid]);
          let radB = radius[oid];

          let diff = posA - posB;
          let dist = length(diff);
          let minDist = radA + radB;

          if (dist < minDist && dist > 0.001) {
            // Collision response — elastic impulse along collision normal
            let normal = diff / dist;
            let overlap = minDist - dist;
            let rest = min(restitution[eid], restitution[oid]);

            // Relative velocity along normal
            let velA = vec3f(vx[eid], vy[eid], vz[eid]);
            let velB = vec3f(vx[oid], vy[oid], vz[oid]);
            let relVel = dot(velA - velB, normal);

            if (relVel < 0.0) {
              // Apply impulse (equal mass assumption for simplicity)
              let j = -(1.0 + rest) * relVel * 0.5;
              vx[eid] = vx[eid] + j * normal.x;
              vy[eid] = vy[eid] + j * normal.y;
              vz[eid] = vz[eid] + j * normal.z;

              // Separation push
              px[eid] = px[eid] + normal.x * overlap * 0.5;
              py[eid] = py[eid] + normal.y * overlap * 0.5;
              pz[eid] = pz[eid] + normal.z * overlap * 0.5;
            }
          }
        }
      }
    }
  }
}
`;

/** Pass 4: Integration — consume intents, apply gravity, integrate position. */
export const integrateWgsl = `
struct Params {
  dt: f32,
  gravity: f32,
  boundsMin: f32,
  boundsMax: f32,
};

@group(0) @binding(0) var<uniform> params: Params;
@group(0) @binding(1) var<storage, read> indices: array<u32>;
@group(0) @binding(2) var<storage, read_write> px: array<f32>;
@group(0) @binding(3) var<storage, read_write> py: array<f32>;
@group(0) @binding(4) var<storage, read_write> pz: array<f32>;
@group(0) @binding(5) var<storage, read_write> vx: array<f32>;
@group(0) @binding(6) var<storage, read_write> vy: array<f32>;
@group(0) @binding(7) var<storage, read_write> vz: array<f32>;
@group(0) @binding(8) var<storage, read_write> fx: array<f32>;
@group(0) @binding(9) var<storage, read_write> fy: array<f32>;
@group(0) @binding(10) var<storage, read_write> fz: array<f32>;

@compute @workgroup_size(64)
fn main(@builtin(global_invocation_id) id: vec3u) {
  if (id.x >= arrayLength(&indices)) { return; }
  let eid = indices[id.x];

  // Apply forces (assume mass=1 for simplicity)
  vx[eid] = vx[eid] + fx[eid] * params.dt;
  vy[eid] = vy[eid] + (fy[eid] + params.gravity) * params.dt;
  vz[eid] = vz[eid] + fz[eid] * params.dt;

  // Clear consumed forces
  fx[eid] = 0.0;
  fy[eid] = 0.0;
  fz[eid] = 0.0;

  // Velocity damping — removes energy so bodies settle
  vx[eid] = vx[eid] * 0.998;
  vy[eid] = vy[eid] * 0.998;
  vz[eid] = vz[eid] * 0.998;

  // Integrate position
  px[eid] = px[eid] + vx[eid] * params.dt;
  py[eid] = py[eid] + vy[eid] * params.dt;
  pz[eid] = pz[eid] + vz[eid] * params.dt;

  // Bounce off bounds (box constraint)
  let dampening = 0.5;
  if (py[eid] < params.boundsMin) {
    py[eid] = params.boundsMin;
    vy[eid] = abs(vy[eid]) * dampening;
  }
  if (py[eid] > params.boundsMax) {
    py[eid] = params.boundsMax;
    vy[eid] = -abs(vy[eid]) * dampening;
  }
  if (px[eid] < params.boundsMin) {
    px[eid] = params.boundsMin;
    vx[eid] = abs(vx[eid]) * dampening;
  }
  if (px[eid] > params.boundsMax) {
    px[eid] = params.boundsMax;
    vx[eid] = -abs(vx[eid]) * dampening;
  }
  if (pz[eid] < params.boundsMin) {
    pz[eid] = params.boundsMin;
    vz[eid] = abs(vz[eid]) * dampening;
  }
  if (pz[eid] > params.boundsMax) {
    pz[eid] = params.boundsMax;
    vz[eid] = -abs(vz[eid]) * dampening;
  }
}
`;

export { TOTAL_CELLS };

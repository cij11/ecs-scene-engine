/**
 * GPU multi-pass physics system — PACKED vec4f buffers with impulse accumulation.
 *
 * Optimized data layout:
 *   pos[N]:     vec4f — xyz=position, w=radius
 *   vel[N]:     vec4f — xyz=velocity, w=restitution
 *   force[N]:   vec4f — xyz=force, w=mass (unused for now, assume mass=1)
 *   impulse[N]: vec4f — xyz=accumulated collision impulse, w=unused
 *
 * 4-pass pipeline (single command encoder submission):
 *   1. Clear spatial grid
 *   2. Populate grid — reads pos.xyz for spatial hash
 *   3. Collision — reads pos, vel; WRITES to impulse buffer (NOT vel/pos)
 *   4. Integrate — reads impulse + force; writes pos, vel; clears impulse + force
 *
 * Key improvement over physics.ts:
 *   The collision pass does NOT write to velocity or position. It only accumulates
 *   impulses into a separate buffer. This eliminates the race condition where two
 *   GPU threads modify the same body's velocity simultaneously.
 *
 * See physics.ts for the original (unpacked, race-prone) version.
 */

// ---------------------------------------------------------------------------
// Grid constants
// ---------------------------------------------------------------------------

export const GRID_SIZE_PACKED = 32;
export const MAX_PER_CELL_PACKED = 4;
export const TOTAL_CELLS_PACKED = GRID_SIZE_PACKED * GRID_SIZE_PACKED * GRID_SIZE_PACKED;

// ---------------------------------------------------------------------------
// Pass 1: Clear spatial grid to -1 (empty)
// ---------------------------------------------------------------------------

export const clearGridPackedWgsl = `
struct Params {
  totalCells: u32,
};

@group(0) @binding(0) var<uniform> params: Params;
@group(0) @binding(1) var<storage, read_write> grid: array<i32>;

@compute @workgroup_size(64)
fn main(@builtin(global_invocation_id) id: vec3u) {
  let cellBase = id.x * ${MAX_PER_CELL_PACKED}u;
  if (cellBase >= params.totalCells * ${MAX_PER_CELL_PACKED}u) { return; }
  for (var i = 0u; i < ${MAX_PER_CELL_PACKED}u; i++) {
    grid[cellBase + i] = -1;
  }
}
`;

// ---------------------------------------------------------------------------
// Pass 2: Populate grid — spatial hash from pos.xyz
// ---------------------------------------------------------------------------

export const populateGridPackedWgsl = `
struct Params {
  gridSize: u32,
  cellSize: f32,
  gridOrigin: f32,
};

@group(0) @binding(0) var<uniform> params: Params;
@group(0) @binding(1) var<storage, read_write> grid: array<atomic<i32>>;
@group(0) @binding(2) var<storage, read> indices: array<u32>;
@group(0) @binding(3) var<storage, read> pos: array<vec4f>;

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

  let p = pos[eid];
  let gx = i32(floor((p.x - params.gridOrigin) / params.cellSize));
  let gy = i32(floor((p.y - params.gridOrigin) / params.cellSize));
  let gz = i32(floor((p.z - params.gridOrigin) / params.cellSize));

  let cell = gridIndex(gx, gy, gz);
  let base = cell * ${MAX_PER_CELL_PACKED}u;

  for (var i = 0u; i < ${MAX_PER_CELL_PACKED}u; i++) {
    let old = atomicCompareExchangeWeak(&grid[base + i], -1, i32(eid));
    if (old.exchanged) { break; }
  }
}
`;

// ---------------------------------------------------------------------------
// Pass 3: Collision — writes ONLY to impulse buffer (no vel/pos writes)
// ---------------------------------------------------------------------------

export const collisionPackedWgsl = `
struct Params {
  gridSize: u32,
  cellSize: f32,
  gridOrigin: f32,
};

@group(0) @binding(0) var<uniform> params: Params;
@group(0) @binding(1) var<storage, read> grid: array<i32>;
@group(0) @binding(2) var<storage, read> indices: array<u32>;
@group(0) @binding(3) var<storage, read> pos: array<vec4f>;
@group(0) @binding(4) var<storage, read> vel: array<vec4f>;
@group(0) @binding(5) var<storage, read_write> impulse: array<vec4f>;

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

  let posA = pos[eid];
  let pA = vec3f(posA.x, posA.y, posA.z);
  let radA = posA.w;

  let velA = vel[eid];
  let vA = vec3f(velA.x, velA.y, velA.z);
  let restA = velA.w;

  let gx = i32(floor((pA.x - params.gridOrigin) / params.cellSize));
  let gy = i32(floor((pA.y - params.gridOrigin) / params.cellSize));
  let gz = i32(floor((pA.z - params.gridOrigin) / params.cellSize));

  var accImpulse = vec3f(0.0, 0.0, 0.0);

  // Check 27 neighboring cells
  for (var dx = -1; dx <= 1; dx++) {
    for (var dy = -1; dy <= 1; dy++) {
      for (var dz = -1; dz <= 1; dz++) {
        let cell = gridIndex(gx + dx, gy + dy, gz + dz);
        let base = cell * ${MAX_PER_CELL_PACKED}u;

        for (var i = 0u; i < ${MAX_PER_CELL_PACKED}u; i++) {
          let other = grid[base + i];
          if (other < 0) { break; }
          let oid = u32(other);
          if (oid == eid) { continue; }

          let posB = pos[oid];
          let pB = vec3f(posB.x, posB.y, posB.z);
          let radB = posB.w;

          let diff = pA - pB;
          let dist = length(diff);
          let minDist = radA + radB;

          if (dist < minDist && dist > 0.001) {
            let normal = diff / dist;
            let overlap = minDist - dist;
            let rest = min(restA, vel[oid].w);

            // Relative velocity along collision normal
            let vB = vec3f(vel[oid].x, vel[oid].y, vel[oid].z);
            let relVel = dot(vA - vB, normal);

            if (relVel < 0.0) {
              // Impulse magnitude (equal mass assumption)
              let j = -(1.0 + rest) * relVel * 0.5;
              accImpulse = accImpulse + normal * j;
            }

            // Position correction — gentle push proportional to overlap
            accImpulse = accImpulse + normal * overlap * 2.0;
          }
        }
      }
    }
  }

  // Accumulate into impulse buffer (additive — handles multiple collisions)
  impulse[eid] = vec4f(
    impulse[eid].x + accImpulse.x,
    impulse[eid].y + accImpulse.y,
    impulse[eid].z + accImpulse.z,
    0.0
  );
}
`;

// ---------------------------------------------------------------------------
// Pass 4: Integrate — apply impulse + force, update pos/vel, clear buffers
// ---------------------------------------------------------------------------

export const integratePackedWgsl = `
struct Params {
  dt: f32,
  gravity: f32,
  boundsMin: f32,
  boundsMax: f32,
};

@group(0) @binding(0) var<uniform> params: Params;
@group(0) @binding(1) var<storage, read> indices: array<u32>;
@group(0) @binding(2) var<storage, read_write> pos: array<vec4f>;
@group(0) @binding(3) var<storage, read_write> vel: array<vec4f>;
@group(0) @binding(4) var<storage, read_write> force: array<vec4f>;
@group(0) @binding(5) var<storage, read_write> impulse: array<vec4f>;

@compute @workgroup_size(64)
fn main(@builtin(global_invocation_id) id: vec3u) {
  if (id.x >= arrayLength(&indices)) { return; }
  let eid = indices[id.x];

  let p = pos[eid];
  let v = vel[eid];
  let f = force[eid];
  let imp = impulse[eid];

  // Preserve packed w components
  let radius = p.w;
  let restitution = v.w;

  // Apply forces (mass=1 assumption — force.w reserved for mass later)
  var vx = v.x + f.x * params.dt;
  var vy = v.y + (f.y + params.gravity) * params.dt;
  var vz = v.z + f.z * params.dt;

  // Apply accumulated impulse (velocity change + separation)
  vx = vx + imp.x;
  vy = vy + imp.y;
  vz = vz + imp.z;

  // Clear consumed force and impulse
  force[eid] = vec4f(0.0, 0.0, 0.0, f.w);
  impulse[eid] = vec4f(0.0, 0.0, 0.0, 0.0);

  // Velocity damping — per sub-step, so effective per-frame damping is pow(d, substeps)
  // 0.999^4 ≈ 0.996 per frame → ~22% loss per second at 60fps
  vx = vx * 0.999;
  vy = vy * 0.999;
  vz = vz * 0.999;

  // Integrate position
  var newX = p.x + vx * params.dt;
  var newY = p.y + vy * params.dt;
  var newZ = p.z + vz * params.dt;

  // Bounce off bounds (box constraint) with dampening
  let dampening = 0.5;
  if (newY < params.boundsMin) {
    newY = params.boundsMin;
    vy = abs(vy) * dampening;
  }
  if (newY > params.boundsMax) {
    newY = params.boundsMax;
    vy = -abs(vy) * dampening;
  }
  if (newX < params.boundsMin) {
    newX = params.boundsMin;
    vx = abs(vx) * dampening;
  }
  if (newX > params.boundsMax) {
    newX = params.boundsMax;
    vx = -abs(vx) * dampening;
  }
  if (newZ < params.boundsMin) {
    newZ = params.boundsMin;
    vz = abs(vz) * dampening;
  }
  if (newZ > params.boundsMax) {
    newZ = params.boundsMax;
    vz = -abs(vz) * dampening;
  }

  // Write back packed data — preserve w components
  pos[eid] = vec4f(newX, newY, newZ, radius);
  vel[eid] = vec4f(vx, vy, vz, restitution);
}
`;

// ---------------------------------------------------------------------------
// Particle vertex shader — reads from packed vec4f pos buffer
// ---------------------------------------------------------------------------

export const particleVertexPackedWgsl = `
struct Camera {
  viewProj: mat4x4f,
  screenHeight: f32,
  particleRadius: f32,
  aspectRatio: f32,
};

@group(0) @binding(0) var<uniform> camera: Camera;
@group(0) @binding(1) var<storage, read> pos: array<vec4f>;

struct VertexOutput {
  @builtin(position) position: vec4f,
  @location(0) uv: vec2f,
};

@vertex
fn main(@builtin(vertex_index) vertexIdx: u32, @builtin(instance_index) instanceIdx: u32) -> VertexOutput {
  // Billboard quad: 2 triangles from 6 vertices
  let quadPos = array<vec2f, 6>(
    vec2f(-1.0, -1.0), vec2f(1.0, -1.0), vec2f(-1.0, 1.0),
    vec2f(-1.0, 1.0), vec2f(1.0, -1.0), vec2f(1.0, 1.0),
  );

  let worldPos = vec3f(pos[instanceIdx].x, pos[instanceIdx].y, pos[instanceIdx].z);
  let clipPos = camera.viewProj * vec4f(worldPos, 1.0);

  // Scale quad by projected particle size, corrected for aspect ratio
  let projSize = camera.particleRadius * camera.screenHeight * 0.02 / clipPos.w;
  let qp = quadPos[vertexIdx];
  let offset = vec2f(qp.x * projSize / camera.aspectRatio, qp.y * projSize);

  var output: VertexOutput;
  output.position = vec4f(clipPos.xy + offset, clipPos.z, clipPos.w);
  output.uv = qp;
  return output;
}
`;

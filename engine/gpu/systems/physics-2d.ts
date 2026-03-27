/**
 * GPU 2D physics system — 5-pass compute pipeline.
 *
 * Pass 1: Clear 2D grid
 * Pass 2: Populate 2D grid (spatial hash of px, py)
 * Pass 3: Circle-circle collision (9-neighbor search)
 * Pass 4: Circle-boundary collision (all bodies vs all boundaries)
 * Pass 5: Integration (forces, gravity, position update)
 *
 * See architecture-2d.md.
 */

export const GRID_2D_SIZE = 64;
export const MAX_PER_CELL_2D = 4;
export const TOTAL_CELLS_2D = GRID_2D_SIZE * GRID_2D_SIZE;

/** Pass 1: Clear 2D grid to -1. */
export const clearGrid2DWgsl = `
struct Params {
  totalCells: u32,
};

@group(0) @binding(0) var<uniform> params: Params;
@group(0) @binding(1) var<storage, read_write> grid: array<i32>;

@compute @workgroup_size(64)
fn main(@builtin(global_invocation_id) id: vec3u) {
  let cellBase = id.x * ${MAX_PER_CELL_2D}u;
  if (cellBase >= params.totalCells * ${MAX_PER_CELL_2D}u) { return; }
  for (var i = 0u; i < ${MAX_PER_CELL_2D}u; i++) {
    grid[cellBase + i] = -1;
  }
}
`;

/** Pass 2: Populate 2D grid — hash px, py into cells. */
export const populateGrid2DWgsl = `
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

fn gridIndex2D(x: i32, y: i32) -> u32 {
  let gs = i32(params.gridSize);
  let cx = clamp(x, 0, gs - 1);
  let cy = clamp(y, 0, gs - 1);
  return u32(cx + cy * gs);
}

@compute @workgroup_size(64)
fn main(@builtin(global_invocation_id) id: vec3u) {
  if (id.x >= arrayLength(&indices)) { return; }
  let eid = indices[id.x];

  let gx = i32(floor((px[eid] - params.gridOrigin) / params.cellSize));
  let gy = i32(floor((py[eid] - params.gridOrigin) / params.cellSize));

  let cell = gridIndex2D(gx, gy);
  let base = cell * ${MAX_PER_CELL_2D}u;

  for (var i = 0u; i < ${MAX_PER_CELL_2D}u; i++) {
    let old = atomicCompareExchangeWeak(&grid[base + i], -1, i32(eid));
    if (old.exchanged) { break; }
  }
}
`;

/** Pass 3: Circle-circle collision — 9-neighbor search. */
export const circleCollision2DWgsl = `
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
@group(0) @binding(5) var<storage, read> radius: array<f32>;
@group(0) @binding(6) var<storage, read> restitution: array<f32>;
@group(0) @binding(7) var<storage, read_write> vx: array<f32>;
@group(0) @binding(8) var<storage, read_write> vy: array<f32>;

fn gridIndex2D(x: i32, y: i32) -> u32 {
  let gs = i32(params.gridSize);
  let cx = clamp(x, 0, gs - 1);
  let cy = clamp(y, 0, gs - 1);
  return u32(cx + cy * gs);
}

@compute @workgroup_size(64)
fn main(@builtin(global_invocation_id) id: vec3u) {
  if (id.x >= arrayLength(&indices)) { return; }
  let eid = indices[id.x];

  let posA = vec2f(px[eid], py[eid]);
  let radA = radius[eid];

  let gx = i32(floor((posA.x - params.gridOrigin) / params.cellSize));
  let gy = i32(floor((posA.y - params.gridOrigin) / params.cellSize));

  // 9-neighbor search
  for (var dx = -1; dx <= 1; dx++) {
    for (var dy = -1; dy <= 1; dy++) {
      let cell = gridIndex2D(gx + dx, gy + dy);
      let base = cell * ${MAX_PER_CELL_2D}u;

      for (var i = 0u; i < ${MAX_PER_CELL_2D}u; i++) {
        let other = grid[base + i];
        if (other < 0) { break; }
        let oid = u32(other);
        if (oid == eid) { continue; }

        let posB = vec2f(px[oid], py[oid]);
        let radB = radius[oid];

        let diff = posA - posB;
        let dist = length(diff);
        let minDist = radA + radB;

        if (dist < minDist && dist > 0.001) {
          let normal = diff / dist;
          let overlap = minDist - dist;
          let rest = min(restitution[eid], restitution[oid]);

          let velA = vec2f(vx[eid], vy[eid]);
          let velB = vec2f(vx[oid], vy[oid]);
          let relVel = dot(velA - velB, normal);

          if (relVel < 0.0) {
            let j = -(1.0 + rest) * relVel * 0.5;
            vx[eid] = vx[eid] + j * normal.x;
            vy[eid] = vy[eid] + j * normal.y;

            px[eid] = px[eid] + normal.x * overlap * 0.5;
            py[eid] = py[eid] + normal.y * overlap * 0.5;
          }
        }
      }
    }
  }
}
`;

/** Pass 4: Circle-boundary collision — all bodies vs all boundary entities. */
export const boundaryCollision2DWgsl = `
struct Params {
  boundaryCount: u32,
  restitution: f32,
};

@group(0) @binding(0) var<uniform> params: Params;
@group(0) @binding(1) var<storage, read> indices: array<u32>;
@group(0) @binding(2) var<storage, read_write> px: array<f32>;
@group(0) @binding(3) var<storage, read_write> py: array<f32>;
@group(0) @binding(4) var<storage, read> radius: array<f32>;
@group(0) @binding(5) var<storage, read_write> vx: array<f32>;
@group(0) @binding(6) var<storage, read_write> vy: array<f32>;
@group(0) @binding(7) var<storage, read> bnx: array<f32>;
@group(0) @binding(8) var<storage, read> bny: array<f32>;
@group(0) @binding(9) var<storage, read> bdist: array<f32>;

@compute @workgroup_size(64)
fn main(@builtin(global_invocation_id) id: vec3u) {
  if (id.x >= arrayLength(&indices)) { return; }
  let eid = indices[id.x];

  let rad = radius[eid];

  for (var b = 0u; b < params.boundaryCount; b++) {
    let normal = vec2f(bnx[b], bny[b]);
    let d = bdist[b];

    // Signed distance from body center to boundary line
    let bodyDist = dot(vec2f(px[eid], py[eid]), normal) - d;

    if (bodyDist < rad) {
      let overlap = rad - bodyDist;
      let relVel = dot(vec2f(vx[eid], vy[eid]), normal);

      if (relVel < 0.0) {
        let j = -(1.0 + params.restitution) * relVel;
        vx[eid] = vx[eid] + j * normal.x;
        vy[eid] = vy[eid] + j * normal.y;
      }

      px[eid] = px[eid] + normal.x * overlap;
      py[eid] = py[eid] + normal.y * overlap;
    }
  }
}
`;

/** Pass 5: Integration — apply forces, gravity, update position. */
export const integrate2DWgsl = `
struct Params {
  dt: f32,
  gravityY: f32,
};

@group(0) @binding(0) var<uniform> params: Params;
@group(0) @binding(1) var<storage, read> indices: array<u32>;
@group(0) @binding(2) var<storage, read_write> px: array<f32>;
@group(0) @binding(3) var<storage, read_write> py: array<f32>;
@group(0) @binding(4) var<storage, read_write> vx: array<f32>;
@group(0) @binding(5) var<storage, read_write> vy: array<f32>;
@group(0) @binding(6) var<storage, read_write> fx: array<f32>;
@group(0) @binding(7) var<storage, read_write> fy: array<f32>;

@compute @workgroup_size(64)
fn main(@builtin(global_invocation_id) id: vec3u) {
  if (id.x >= arrayLength(&indices)) { return; }
  let eid = indices[id.x];

  // Apply forces (assume mass=1)
  vx[eid] = vx[eid] + fx[eid] * params.dt;
  vy[eid] = vy[eid] + (fy[eid] + params.gravityY) * params.dt;

  // Clear consumed forces
  fx[eid] = 0.0;
  fy[eid] = 0.0;

  // Integrate position
  px[eid] = px[eid] + vx[eid] * params.dt;
  py[eid] = py[eid] + vy[eid] * params.dt;

  // Damping
  vx[eid] = vx[eid] * 0.999;
  vy[eid] = vy[eid] * 0.999;
}
`;

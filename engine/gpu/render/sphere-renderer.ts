/**
 * GPU-direct sphere renderer.
 *
 * Renders spheres directly from GPU storage buffers — no readback to CPU.
 * Uses WebGPU render pipeline with instanced drawing.
 * The vertex shader reads px[], py[], pz[] storage buffers to position each instance.
 */

export const sphereVertexWgsl = `
struct Camera {
  viewProj: mat4x4f,
};

@group(0) @binding(0) var<uniform> camera: Camera;
@group(0) @binding(1) var<storage, read> px: array<f32>;
@group(0) @binding(2) var<storage, read> py: array<f32>;
@group(0) @binding(3) var<storage, read> pz: array<f32>;

struct VertexInput {
  @location(0) position: vec3f,
  @location(1) normal: vec3f,
  @builtin(instance_index) instanceIdx: u32,
};

struct VertexOutput {
  @builtin(position) position: vec4f,
  @location(0) normal: vec3f,
  @location(1) worldPos: vec3f,
};

@vertex
fn main(input: VertexInput) -> VertexOutput {
  let instancePos = vec3f(
    px[input.instanceIdx],
    py[input.instanceIdx],
    pz[input.instanceIdx],
  );

  let worldPos = input.position + instancePos;

  var output: VertexOutput;
  output.position = camera.viewProj * vec4f(worldPos, 1.0);
  output.normal = input.normal;
  output.worldPos = worldPos;
  return output;
}
`;

export const sphereFragmentWgsl = `
struct LightParams {
  direction: vec3f,
  ambient: f32,
};

@group(0) @binding(4) var<uniform> light: LightParams;

struct FragmentInput {
  @location(0) normal: vec3f,
  @location(1) worldPos: vec3f,
};

@fragment
fn main(input: FragmentInput) -> @location(0) vec4f {
  let n = normalize(input.normal);
  let l = normalize(light.direction);
  let diffuse = max(dot(n, l), 0.0);
  let color = vec3f(1.0, 0.53, 0.0); // orange
  let lit = color * (light.ambient + diffuse * (1.0 - light.ambient));
  return vec4f(lit, 1.0);
}
`;

/**
 * Generate sphere geometry data (positions + normals + indices).
 */
export function createSphereGeometry(
  radius: number,
  segments: number,
): {
  positions: Float32Array;
  normals: Float32Array;
  indices: Uint16Array;
  vertexCount: number;
  indexCount: number;
} {
  const rings = segments;
  const sectors = segments;
  const vertexCount = (rings + 1) * (sectors + 1);
  const indexCount = rings * sectors * 6;

  const positions = new Float32Array(vertexCount * 3);
  const normals = new Float32Array(vertexCount * 3);
  const indicesArr = new Uint16Array(indexCount);

  let vi = 0;
  for (let r = 0; r <= rings; r++) {
    const phi = (Math.PI * r) / rings;
    const sinPhi = Math.sin(phi);
    const cosPhi = Math.cos(phi);

    for (let s = 0; s <= sectors; s++) {
      const theta = (2 * Math.PI * s) / sectors;
      const sinTheta = Math.sin(theta);
      const cosTheta = Math.cos(theta);

      const nx = cosTheta * sinPhi;
      const ny = cosPhi;
      const nz = sinTheta * sinPhi;

      positions[vi * 3] = radius * nx;
      positions[vi * 3 + 1] = radius * ny;
      positions[vi * 3 + 2] = radius * nz;
      normals[vi * 3] = nx;
      normals[vi * 3 + 1] = ny;
      normals[vi * 3 + 2] = nz;
      vi++;
    }
  }

  let ii = 0;
  for (let r = 0; r < rings; r++) {
    for (let s = 0; s < sectors; s++) {
      const a = r * (sectors + 1) + s;
      const b = a + sectors + 1;
      indicesArr[ii++] = a;
      indicesArr[ii++] = b;
      indicesArr[ii++] = a + 1;
      indicesArr[ii++] = a + 1;
      indicesArr[ii++] = b;
      indicesArr[ii++] = b + 1;
    }
  }

  return { positions, normals, indices: indicesArr, vertexCount, indexCount };
}

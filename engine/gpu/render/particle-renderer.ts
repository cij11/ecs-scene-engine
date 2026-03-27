/**
 * GPU-direct particle renderer using point sprites.
 *
 * Each particle is a single vertex positioned by reading px/py/pz storage buffers.
 * Fragment shader draws a circle with simple lighting.
 * Much cheaper than instanced sphere geometry.
 */

export const particleVertexWgsl = `
struct Camera {
  viewProj: mat4x4f,
  screenHeight: f32,
  particleRadius: f32,
  aspectRatio: f32,
};

@group(0) @binding(0) var<uniform> camera: Camera;
@group(0) @binding(1) var<storage, read> px: array<f32>;
@group(0) @binding(2) var<storage, read> py: array<f32>;
@group(0) @binding(3) var<storage, read> pz: array<f32>;

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

  let worldPos = vec3f(px[instanceIdx], py[instanceIdx], pz[instanceIdx]);
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

export const particleFragmentWgsl = `
@fragment
fn main(@location(0) uv: vec2f) -> @location(0) vec4f {
  // Discard pixels outside circle
  let dist = length(uv);
  if (dist > 1.0) { discard; }

  // Soft edge + simple shading (brighter in center)
  let brightness = 1.0 - dist * 0.4;
  let color = vec3f(1.0, 0.53, 0.0) * brightness;
  return vec4f(color, 1.0);
}
`;

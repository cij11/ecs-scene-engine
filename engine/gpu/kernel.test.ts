import { describe, it, expect, beforeEach } from "vitest";
import { resetComponentIdCounter, defineComponent, defineTag } from "../ecs/component.js";
import { generateWgsl, countBindings } from "./kernel.js";
import type { GpuKernelDef } from "./kernel.js";

beforeEach(() => {
  resetComponentIdCounter();
});

// ---------------------------------------------------------------------------
// Test components
// ---------------------------------------------------------------------------

const Transform = defineComponent({
  px: Float32Array,
  py: Float32Array,
  pz: Float32Array,
});

const Velocity = defineComponent({
  vx: Float32Array,
  vy: Float32Array,
  vz: Float32Array,
});

const GpuParticleTag = defineTag();

const GpuParticleLife = defineComponent({
  age: Float32Array,
  maxAge: Float32Array,
});

const GpuParticleVisual = defineComponent({
  r: Float32Array,
  g: Float32Array,
  b: Float32Array,
  a: Float32Array,
});

const GpuForce = defineComponent({
  fx: Float32Array,
  fy: Float32Array,
  fz: Float32Array,
});

const GpuImpulse = defineComponent({
  ix: Float32Array,
  iy: Float32Array,
  iz: Float32Array,
});

const GpuTeleport = defineComponent({
  tx: Float32Array,
  ty: Float32Array,
  tz: Float32Array,
  active: Uint8Array,
});

const GpuRigidBody = defineComponent({
  mass: Float32Array,
  restitution: Float32Array,
});

// ---------------------------------------------------------------------------
// Movement kernel
// ---------------------------------------------------------------------------

describe("movement kernel", () => {
  const movementKernel: GpuKernelDef = {
    name: "gpu_movement",
    query: [Transform, Velocity],
    read: [Velocity],
    write: [Transform],
    uniforms: { dt: "f32" },
    wgsl: `let eid = indices[id.x];
px[eid] = px[eid] + vx[eid] * uniforms.dt;
py[eid] = py[eid] + vy[eid] * uniforms.dt;
pz[eid] = pz[eid] + vz[eid] * uniforms.dt;`,
  };

  it("generates correct binding count", () => {
    // 1 uniform + 1 index + 3 read (vx,vy,vz) + 3 write (px,py,pz) = 8
    expect(countBindings(movementKernel)).toBe(8);
  });

  it("generates valid WGSL structure", () => {
    const wgsl = generateWgsl(movementKernel);

    expect(wgsl).toContain("struct Uniforms {");
    expect(wgsl).toContain("dt: f32,");
    expect(wgsl).toContain("var<uniform> uniforms: Uniforms;");
    expect(wgsl).toContain("var<storage, read> indices: array<u32>;");
    expect(wgsl).toContain("var<storage, read> vx: array<f32>;");
    expect(wgsl).toContain("var<storage, read> vy: array<f32>;");
    expect(wgsl).toContain("var<storage, read> vz: array<f32>;");
    expect(wgsl).toContain("var<storage, read_write> px: array<f32>;");
    expect(wgsl).toContain("var<storage, read_write> py: array<f32>;");
    expect(wgsl).toContain("var<storage, read_write> pz: array<f32>;");
    expect(wgsl).toContain("@compute @workgroup_size(64)");
    expect(wgsl).toContain("if (id.x >= arrayLength(&indices)) { return; }");
  });

  it("includes user WGSL body", () => {
    const wgsl = generateWgsl(movementKernel);
    expect(wgsl).toContain("px[eid] = px[eid] + vx[eid] * uniforms.dt;");
  });

  it("assigns sequential binding indices", () => {
    const wgsl = generateWgsl(movementKernel);
    expect(wgsl).toContain("@binding(0) var<uniform>");
    expect(wgsl).toContain("@binding(1) var<storage, read> indices");
    expect(wgsl).toContain("@binding(2)");
    expect(wgsl).toContain("@binding(7)");
  });
});

// ---------------------------------------------------------------------------
// Particle kernel
// ---------------------------------------------------------------------------

describe("particle kernel", () => {
  const particleKernel: GpuKernelDef = {
    name: "gpu_particle_integrate",
    query: [GpuParticleTag, Transform, Velocity, GpuParticleLife],
    read: [Velocity, GpuParticleLife],
    write: [Transform, GpuParticleVisual],
    uniforms: { dt: "f32", gravity: "f32" },
    wgsl: `let eid = indices[id.x];
px[eid] = px[eid] + vx[eid] * uniforms.dt;`,
  };

  it("generates correct binding count", () => {
    // 1 uniform + 1 index + 3 read (vx,vy,vz) + 2 read (age,maxAge) + 3 write (px,py,pz) + 4 write (r,g,b,a) = 14
    expect(countBindings(particleKernel)).toBe(14);
  });

  it("includes both uniform fields", () => {
    const wgsl = generateWgsl(particleKernel);
    expect(wgsl).toContain("dt: f32,");
    expect(wgsl).toContain("gravity: f32,");
  });

  it("marks read components as read-only", () => {
    const wgsl = generateWgsl(particleKernel);
    expect(wgsl).toContain("var<storage, read> vx:");
    expect(wgsl).toContain("var<storage, read> age:");
    expect(wgsl).toContain("var<storage, read> maxAge:");
  });

  it("marks write components as read_write", () => {
    const wgsl = generateWgsl(particleKernel);
    expect(wgsl).toContain("var<storage, read_write> px:");
    expect(wgsl).toContain("var<storage, read_write> r:");
    expect(wgsl).toContain("var<storage, read_write> a:");
  });
});

// ---------------------------------------------------------------------------
// Physics integration kernel (with intent components)
// ---------------------------------------------------------------------------

describe("physics integration kernel", () => {
  const physicsKernel: GpuKernelDef = {
    name: "gpu_physics_integrate",
    query: [GpuRigidBody, Transform, Velocity],
    read: [GpuForce, GpuImpulse, GpuTeleport, GpuRigidBody],
    write: [Transform, Velocity],
    uniforms: { dt: "f32", substeps: "u32" },
    wgsl: `let eid = indices[id.x];
px[eid] = px[eid] + vx[eid] * uniforms.dt;`,
  };

  it("generates correct binding count", () => {
    // 1 uniform + 1 index
    // + 3 read (fx,fy,fz) + 3 read (ix,iy,iz) + 4 read (tx,ty,tz,active) + 2 read (mass,restitution)
    // + 3 write (px,py,pz) + 3 write (vx,vy,vz)
    // = 2 + 12 + 6 = 20
    expect(countBindings(physicsKernel)).toBe(20);
  });

  it("includes intent component fields as read bindings", () => {
    const wgsl = generateWgsl(physicsKernel);
    expect(wgsl).toContain("var<storage, read> fx: array<f32>;");
    expect(wgsl).toContain("var<storage, read> fy: array<f32>;");
    expect(wgsl).toContain("var<storage, read> fz: array<f32>;");
    expect(wgsl).toContain("var<storage, read> ix: array<f32>;");
    expect(wgsl).toContain("var<storage, read> iy: array<f32>;");
    expect(wgsl).toContain("var<storage, read> iz: array<f32>;");
    expect(wgsl).toContain("var<storage, read> tx: array<f32>;");
    expect(wgsl).toContain("var<storage, read> ty: array<f32>;");
    expect(wgsl).toContain("var<storage, read> tz: array<f32>;");
  });

  it("maps Uint8Array to u32 for GpuTeleport.active", () => {
    const wgsl = generateWgsl(physicsKernel);
    expect(wgsl).toContain("var<storage, read> active: array<u32>;");
  });

  it("includes both uniform types", () => {
    const wgsl = generateWgsl(physicsKernel);
    expect(wgsl).toContain("dt: f32,");
    expect(wgsl).toContain("substeps: u32,");
  });

  it("GpuRigidBody fields are read-only", () => {
    const wgsl = generateWgsl(physicsKernel);
    expect(wgsl).toContain("var<storage, read> mass: array<f32>;");
    expect(wgsl).toContain("var<storage, read> restitution: array<f32>;");
  });
});

// ---------------------------------------------------------------------------
// Edge cases
// ---------------------------------------------------------------------------

describe("edge cases", () => {
  it("no uniforms omits uniform struct", () => {
    const kernel: GpuKernelDef = {
      name: "no_uniforms",
      query: [Transform],
      read: [],
      write: [Transform],
      wgsl: "let eid = indices[id.x];",
    };

    const wgsl = generateWgsl(kernel);
    expect(wgsl).not.toContain("struct Uniforms");
    expect(wgsl).not.toContain("var<uniform>");
    // Index buffer should be binding 0
    expect(wgsl).toContain("@binding(0) var<storage, read> indices");
  });

  it("empty uniforms object omits uniform struct", () => {
    const kernel: GpuKernelDef = {
      name: "empty_uniforms",
      query: [Transform],
      read: [],
      write: [Transform],
      uniforms: {},
      wgsl: "let eid = indices[id.x];",
    };

    const wgsl = generateWgsl(kernel);
    expect(wgsl).not.toContain("struct Uniforms");
  });

  it("tag components excluded from bindings", () => {
    const kernel: GpuKernelDef = {
      name: "with_tag",
      query: [GpuParticleTag, Transform],
      read: [],
      write: [Transform],
      wgsl: "let eid = indices[id.x];",
    };

    // GpuParticleTag is in query but not in read/write — should not generate bindings
    // 1 index + 3 write (px,py,pz) = 4
    expect(countBindings(kernel)).toBe(4);
  });

  it("custom workgroup size", () => {
    const kernel: GpuKernelDef = {
      name: "custom_wg",
      query: [Transform],
      read: [],
      write: [Transform],
      workgroupSize: 256,
      wgsl: "let eid = indices[id.x];",
    };

    const wgsl = generateWgsl(kernel);
    expect(wgsl).toContain("@workgroup_size(256)");
    expect(wgsl).not.toContain("@workgroup_size(64)");
  });

  it("component in both read and write is deduplicated as read_write", () => {
    const kernel: GpuKernelDef = {
      name: "dedup",
      query: [GpuParticleLife],
      read: [GpuParticleLife],
      write: [GpuParticleLife],
      wgsl: "let eid = indices[id.x];",
    };

    const wgsl = generateWgsl(kernel);
    // Should appear once as read_write, not twice
    const ageMatches = wgsl.match(/var<storage.*> age:/g);
    expect(ageMatches).toHaveLength(1);
    expect(wgsl).toContain("var<storage, read_write> age:");
  });

  it("field name collision is namespaced", () => {
    // Two components with a field named 'x'
    const CompA = defineComponent({ x: Float32Array, y: Float32Array });
    const CompB = defineComponent({ x: Float32Array, z: Float32Array });

    const kernel: GpuKernelDef = {
      name: "collision_test",
      query: [CompA, CompB],
      read: [CompA],
      write: [CompB],
      wgsl: "let eid = indices[id.x];",
    };

    const wgsl = generateWgsl(kernel);
    // 'x' appears in both — should be namespaced
    expect(wgsl).toContain(`c${CompA.id}_x`);
    expect(wgsl).toContain(`c${CompB.id}_x`);
    // 'y' and 'z' are unique — should NOT be namespaced
    expect(wgsl).toContain("var<storage, read> y:");
    expect(wgsl).toContain("var<storage, read_write> z:");
  });
});

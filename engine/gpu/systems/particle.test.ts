import { describe, it, expect, beforeEach } from "vitest";
import { resetComponentIdCounter } from "../../ecs/component.js";
import { Velocity } from "../../ecs/components/velocity.js";
import { GpuPosition } from "../components/position.js";
import { GpuParticleTag, GpuParticleLife } from "../components/particle.js";
import { gpuParticleIntegrateKernel } from "./particle.js";
import { generateWgsl, countBindings } from "../kernel.js";

beforeEach(() => {
  resetComponentIdCounter();
});

describe("particle components", () => {
  it("GpuParticleTag is a tag (no schema)", () => {
    expect(GpuParticleTag.isTag).toBe(true);
  });

  it("GpuParticleLife has age and maxAge fields", () => {
    expect(GpuParticleLife.schema.age).toBe(Float32Array);
    expect(GpuParticleLife.schema.maxAge).toBe(Float32Array);
  });

  // GpuParticleVisual tested separately — not included in the particle kernel
  // to stay within the WebGPU storage buffer limit.
});

describe("gpuParticleIntegrateKernel", () => {
  it("queries GpuParticleTag, GpuPosition, Velocity, GpuParticleLife", () => {
    expect(gpuParticleIntegrateKernel.query).toContain(GpuParticleTag);
    expect(gpuParticleIntegrateKernel.query).toContain(GpuPosition);
    expect(gpuParticleIntegrateKernel.query).toContain(Velocity);
    expect(gpuParticleIntegrateKernel.query).toContain(GpuParticleLife);
  });

  it("reads Velocity", () => {
    expect(gpuParticleIntegrateKernel.read).toContain(Velocity);
    expect(gpuParticleIntegrateKernel.read).not.toContain(GpuParticleLife);
  });

  it("writes GpuPosition and GpuParticleLife", () => {
    expect(gpuParticleIntegrateKernel.write).toContain(GpuPosition);
    expect(gpuParticleIntegrateKernel.write).toContain(GpuParticleLife);
  });

  it("has dt and gravity uniforms", () => {
    expect(gpuParticleIntegrateKernel.uniforms).toEqual({
      dt: "f32",
      gravity: "f32",
    });
  });

  it("generates correct binding count", () => {
    // 1 uniform + 1 index
    // + 3 read (vx,vy,vz)
    // + 3 write (px,py,pz) + 2 write (age,maxAge)
    // = 10
    expect(countBindings(gpuParticleIntegrateKernel)).toBe(10);
  });

  it("generates valid WGSL with position integration", () => {
    const wgsl = generateWgsl(gpuParticleIntegrateKernel);
    expect(wgsl).toContain("px[eid] = px[eid] + vx[eid] * uniforms.dt");
    expect(wgsl).toContain("uniforms.gravity");
    expect(wgsl).toContain("age[eid] = age[eid] + uniforms.dt");
  });

  it("generates WGSL with correct access modes", () => {
    const wgsl = generateWgsl(gpuParticleIntegrateKernel);
    // Read-only
    expect(wgsl).toContain("var<storage, read> vx:");
    // Read-write
    expect(wgsl).toContain("var<storage, read_write> px:");
    expect(wgsl).toContain("var<storage, read_write> age:");
    expect(wgsl).toContain("var<storage, read_write> maxAge:");
  });

  it("uses workgroup size 64", () => {
    expect(gpuParticleIntegrateKernel.workgroupSize).toBe(64);
    const wgsl = generateWgsl(gpuParticleIntegrateKernel);
    expect(wgsl).toContain("@workgroup_size(64)");
  });
});

/**
 * GpuKernelDef — DSL for defining GPU compute kernels, and
 * generateWgsl() for producing valid WGSL from kernel definitions.
 *
 * See architecture.md sections 5 and 6.
 */

import type { ComponentDef } from "../ecs/component.js";
import type { QueryTerm } from "../ecs/query.js";
import type { WgslType } from "./types.js";
import { typedArrayToWgsl } from "./types.js";

// ---------------------------------------------------------------------------
// Kernel definition
// ---------------------------------------------------------------------------

export interface GpuKernelDef {
  /** Unique name for this kernel (used for pipeline caching) */
  name: string;
  /** Which entities to process — provides dispatch indices */
  query: QueryTerm[];
  /** Components bound as read-only storage */
  read: ComponentDef[];
  /** Components bound as read-write storage */
  write: ComponentDef[];
  /** Uniform values passed each frame */
  uniforms?: Record<string, WgslType>;
  /** Workgroup size (default 64) */
  workgroupSize?: number;
  /** WGSL body snippet — inserted inside the main() entry point */
  wgsl: string;
}

// ---------------------------------------------------------------------------
// WGSL code generation
// ---------------------------------------------------------------------------

/**
 * Detect field name collisions across components and return a
 * mapping from (componentId, fieldName) → WGSL variable name.
 * Only namespaces when a collision exists.
 */
function resolveFieldNames(components: ComponentDef[]): Map<string, string> {
  // Deduplicate components first (same component in read+write)
  const seen = new Set<number>();
  const unique: ComponentDef[] = [];
  for (const comp of components) {
    if (!seen.has(comp.id)) {
      seen.add(comp.id);
      unique.push(comp);
    }
  }

  // Count occurrences of each field name across unique components
  const counts = new Map<string, number>();
  for (const comp of unique) {
    for (const field in comp.schema) {
      counts.set(field, (counts.get(field) ?? 0) + 1);
    }
  }

  const result = new Map<string, string>();
  for (const comp of components) {
    for (const field in comp.schema) {
      const key = `${comp.id}:${field}`;
      if (counts.get(field)! > 1) {
        // Collision — namespace with component id
        result.set(key, `c${comp.id}_${field}`);
      } else {
        result.set(key, field);
      }
    }
  }
  return result;
}

/**
 * Generate a complete, valid WGSL compute shader from a kernel definition.
 */
export function generateWgsl(kernel: GpuKernelDef): string {
  const lines: string[] = [];
  let binding = 0;
  const wgSize = kernel.workgroupSize ?? 64;

  // --- Uniform struct ---
  if (kernel.uniforms && Object.keys(kernel.uniforms).length > 0) {
    lines.push("struct Uniforms {");
    for (const [name, type] of Object.entries(kernel.uniforms)) {
      lines.push(`  ${name}: ${type},`);
    }
    lines.push("};");
    lines.push("");
    lines.push(`@group(0) @binding(${binding}) var<uniform> uniforms: Uniforms;`);
    binding++;
  }

  // --- Index buffer (query results) ---
  lines.push(`@group(0) @binding(${binding}) var<storage, read> indices: array<u32>;`);
  binding++;

  // --- Resolve field names across all components ---
  const allComponents = [...kernel.read, ...kernel.write];
  const writeIds = new Set(kernel.write.map((c) => c.id));
  const nameMap = resolveFieldNames(allComponents);

  // --- Component field bindings ---
  // Track which components we've already emitted (avoid duplicates if
  // a component appears in both read and write)
  const emitted = new Set<number>();

  for (const comp of allComponents) {
    if (emitted.has(comp.id)) continue;
    emitted.add(comp.id);

    const access = writeIds.has(comp.id) ? "read_write" : "read";

    for (const field in comp.schema) {
      const key = `${comp.id}:${field}`;
      const varName = nameMap.get(key)!;
      const wgslType = typedArrayToWgsl(comp.schema[field]!);

      lines.push(
        `@group(0) @binding(${binding}) var<storage, ${access}> ${varName}: array<${wgslType}>;`,
      );
      binding++;
    }
  }

  // --- Entry point ---
  lines.push("");
  lines.push(`@compute @workgroup_size(${wgSize})`);
  lines.push("fn main(@builtin(global_invocation_id) id: vec3u) {");
  lines.push("  if (id.x >= arrayLength(&indices)) { return; }");

  // Indent user WGSL body
  const body = kernel.wgsl.trim();
  for (const line of body.split("\n")) {
    lines.push(`  ${line}`);
  }

  lines.push("}");

  return lines.join("\n");
}

/**
 * Count the total number of bindings a kernel will produce.
 * Useful for validation and testing.
 */
export function countBindings(kernel: GpuKernelDef): number {
  let count = 0;

  // Uniforms
  if (kernel.uniforms && Object.keys(kernel.uniforms).length > 0) {
    count++;
  }

  // Index buffer
  count++;

  // Component fields (deduplicated)
  const emitted = new Set<number>();
  for (const comp of [...kernel.read, ...kernel.write]) {
    if (emitted.has(comp.id)) continue;
    emitted.add(comp.id);
    count += Object.keys(comp.schema).length;
  }

  return count;
}

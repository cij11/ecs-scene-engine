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

/**
 * Field selection — bind only specific fields of a component.
 * Use the `fields()` helper to create one.
 */
export interface FieldSelection {
  component: ComponentDef;
  fields: string[];
}

/** Select specific fields from a component for GPU binding. */
export function fields(component: ComponentDef, ...fieldNames: string[]): FieldSelection {
  return { component, fields: fieldNames };
}

/** A binding entry is either a full component or a field selection. */
export type BindingEntry = ComponentDef | FieldSelection;

export function isFieldSelection(entry: BindingEntry): entry is FieldSelection {
  return "fields" in entry && "component" in entry;
}

export function getComponentDef(entry: BindingEntry): ComponentDef {
  return isFieldSelection(entry) ? entry.component : entry;
}

export function getFieldNames(entry: BindingEntry): string[] {
  if (isFieldSelection(entry)) return entry.fields;
  return Object.keys(entry.schema);
}

export interface GpuKernelDef {
  /** Unique name for this kernel (used for pipeline caching) */
  name: string;
  /** Which entities to process — provides dispatch indices */
  query: QueryTerm[];
  /** Components bound as read-only storage. Use fields() for subset binding. */
  read: BindingEntry[];
  /** Components bound as read-write storage. Use fields() for subset binding. */
  write: BindingEntry[];
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

/** Resolved binding: component + selected fields for code generation. */
interface ResolvedBinding {
  compId: number;
  comp: ComponentDef;
  fieldNames: string[];
  access: "read" | "read_write";
}

/**
 * Resolve all binding entries into a flat list of (comp, fields, access),
 * deduplicating components (write wins over read).
 */
function resolveBindings(kernel: GpuKernelDef): ResolvedBinding[] {
  const writeIds = new Set(kernel.write.map((e) => getComponentDef(e).id));

  // Collect all entries, tracking fields per component
  const fieldsByComp = new Map<
    number,
    { comp: ComponentDef; fields: Set<string>; access: "read" | "read_write" }
  >();

  for (const entry of [...kernel.read, ...kernel.write]) {
    const comp = getComponentDef(entry);
    const entryFields = getFieldNames(entry);
    const existing = fieldsByComp.get(comp.id);

    if (existing) {
      // Merge fields
      for (const f of entryFields) existing.fields.add(f);
      // Write wins
      if (writeIds.has(comp.id)) existing.access = "read_write";
    } else {
      fieldsByComp.set(comp.id, {
        comp,
        fields: new Set(entryFields),
        access: writeIds.has(comp.id) ? "read_write" : "read",
      });
    }
  }

  return Array.from(fieldsByComp.values()).map((v) => ({
    compId: v.comp.id,
    comp: v.comp,
    fieldNames: Array.from(v.fields),
    access: v.access,
  }));
}

/**
 * Detect field name collisions and return a mapping
 * from (componentId, fieldName) → WGSL variable name.
 */
function resolveFieldNames(bindings: ResolvedBinding[]): Map<string, string> {
  const counts = new Map<string, number>();
  for (const b of bindings) {
    for (const field of b.fieldNames) {
      counts.set(field, (counts.get(field) ?? 0) + 1);
    }
  }

  const result = new Map<string, string>();
  for (const b of bindings) {
    for (const field of b.fieldNames) {
      const key = `${b.compId}:${field}`;
      if (counts.get(field)! > 1) {
        result.set(key, `c${b.compId}_${field}`);
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

  // --- Resolve bindings and field names ---
  const bindings = resolveBindings(kernel);
  const nameMap = resolveFieldNames(bindings);

  // --- Component field bindings ---
  for (const b of bindings) {
    for (const field of b.fieldNames) {
      const key = `${b.compId}:${field}`;
      const varName = nameMap.get(key)!;
      const wgslType = typedArrayToWgsl(b.comp.schema[field]!);

      lines.push(
        `@group(0) @binding(${binding}) var<storage, ${b.access}> ${varName}: array<${wgslType}>;`,
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

  // Component fields (deduplicated via resolveBindings)
  const bindings = resolveBindings(kernel);
  for (const b of bindings) {
    count += b.fieldNames.length;
  }

  return count;
}

/**
 * System pipeline with named phases.
 *
 * Systems are plain functions registered into phases. The pipeline
 * executes phases in order, running each system with the world and dt.
 */

export const PHASES = [
  "preUpdate",
  "update",
  "postUpdate",
  "preRender",
  "cleanup",
] as const;

export type Phase = typeof PHASES[number];

export type SystemFn = (world: any, dt: number) => void;

export interface Pipeline {
  phases: Record<Phase, SystemFn[]>;
}

export function createPipeline(): Pipeline {
  const phases = {} as Record<Phase, SystemFn[]>;
  for (const phase of PHASES) {
    phases[phase] = [];
  }
  return { phases };
}

export function insertSystem(
  pipeline: Pipeline,
  phase: Phase,
  system: SystemFn,
): void {
  pipeline.phases[phase].push(system);
}

export function removeSystem(
  pipeline: Pipeline,
  phase: Phase,
  system: SystemFn,
): boolean {
  const systems = pipeline.phases[phase];
  const idx = systems.indexOf(system);
  if (idx === -1) return false;
  systems.splice(idx, 1);
  return true;
}

export function tickPipeline(
  pipeline: Pipeline,
  world: any,
  dt: number,
): void {
  for (const phase of PHASES) {
    const systems = pipeline.phases[phase];
    for (let i = 0; i < systems.length; i++) {
      systems[i]!(world, dt);
    }
  }
}

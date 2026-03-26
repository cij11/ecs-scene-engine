## Status
readyForDev

## Title
feat-ESE-0003-06: Implement system pipeline with phases

## Description
Implement the system pipeline. Systems are plain functions registered into named phases. The pipeline executes phases in order: pre-update, update, post-update, pre-render, cleanup.

## Acceptance Criteria
- createPipeline returns a pipeline with the 5 defined phases
- insertSystem adds a system function to a specific phase
- removeSystem removes a system from the pipeline
- Pipeline tick executes all systems in phase order, passing world and dt
- Systems within a phase execute in insertion order

## Testing Scenarios
- Insert systems into different phases, tick, verify execution order
- Remove a system, tick, verify it no longer runs
- Insert two systems into same phase, verify insertion order

## Testing Notes
Unit tests in engine/ecs/system.test.ts

## Size
1

## Subtasks

## Started

## Completed

## Blockers

## Knowledge Gaps

## Comments

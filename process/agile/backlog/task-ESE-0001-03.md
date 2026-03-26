## Status
draft

## Title
task-ESE-0001-03: Define lazy ECS strategy

## Description
Define when ECS simulation runs and when it doesn't. While everything is a scene with its own ECS, static scenes (e.g. TextLabel) and sleeping entities should not run an ECS tick. This is critical for performance.

## Acceptance Criteria
- Criteria for when a scene's ECS ticks vs is dormant are defined
- Sleep/wake mechanism is documented
- Performance implications are addressed
- Documented in docs/

## Testing Scenarios
- A developer can read the doc and understand which scenes will tick and which won't
- A developer can understand how to wake a sleeping scene

## Testing Notes
Documentation ticket. Validation by review.

## Size
1

## Subtasks

## Started

## Completed

## Blockers
- task-ESE-0001-02 (need scene tree model first)

## Knowledge Gaps

## Comments

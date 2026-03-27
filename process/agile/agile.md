Before a sprint, we determine clear sprint goals.

Before starting a ticket, we refine the ticket, with clear acceptance criteria. We check the definition of ready before starting work, and the definition of done before completing work.

- [Definition of Ready](definitionOfReady.md)
- [Definition of Done](definitionOfDone.md)

## Ticket Format

Title format: `[feat|bugfix|task]-ESE-xxxx`

Sections:

- **Status**: See status flow below.
- **Title**
- **Description**
- **Acceptance Criteria**
- **Demo Deliverable**: What the demo should show. Agreed during refinement. Must be expressive enough that an agent reviewing the demo can understand what is being demonstrated without external guidance.
- **Testing Scenarios**
- **Testing Notes**
- **Size**: In story points. Initially an arbitrary estimate, which will get more accurate over time. When a ticket has subtasks, it has no points of its own — its size is the recursive sum of its subtasks.
- **Subtasks**: Tickets get broken down if they are too large. Subtask names are suffixed to their parent: e.g. `task-ESE-0001-01`, `task-ESE-0001-02`. Once a subtask gains subtasks of its own, it is promoted to a top-level ticket with the next available number. The old subtask reference in the parent is updated to point to the new ticket.
- **Stakeholder Understanding**: Before moving to readyForDev, the stakeholder must explain the ticket back to the agent in sufficient detail. The agent records a summary of the stakeholder's explanation here. If empty, the ticket cannot be marked readyForDev.
- **Demo Accepted**: Before a sprint can be closed, the stakeholder must confirm the demo is acceptable. Record "accepted" or "rejected" with a timestamp and any feedback.
- **Team**: The session ID of the agent working on the ticket.
- **Started**
- **Completed**
- **Blockers**
- **Knowledge Gaps**
- **Comments**

## Status Flow

All ticket types follow the same flow:

```
inRefinement → readyForDev → inDevelopment → inTesting → inReview → buildingDemo → validatingDemo → done
```

### Status definitions

| Status | What happens | Exit criteria |
|--------|-------------|---------------|
| `inRefinement` | Ticket being refined | All fields filled (description, AC, size, stakeholder understanding, demo deliverable, testing scenarios) |
| `readyForDev` | Ready to be picked up | None |
| `inDevelopment` | Code being written | None |
| `inTesting` | CI pipeline runs | CI passes (`npm run ci`) |
| `inReview` | Code review against AC | No critical/severe issues in review.md |
| `buildingDemo` | Demo artifacts created | demo-expected.json, demo-readme.json, and artifact files present |
| `validatingDemo` | Context-free agent reviews demo | demo-actual.json with interpretations, demoMatchesExpected, validatedBy |
| `done` | Complete | CI passes, demoAccepted (human interactive confirmation), subtasks done |

Backward transitions are always allowed without exit criteria.

## Demo Process

All tickets go through the demo process.

### During refinement

Every ticket must define a **Demo Deliverable** — a description of what the demo should show. The demo must be expressive enough that an independent agent reviewing only the artifacts can understand what is being demonstrated.

### buildingDemo

Build the demo. Demos produce artifacts:
- **Video demos** (`artifactType: "video"`): screenshots captured at 30fps
- **Terminal demos** (`artifactType: "terminal"`): CLI output captured to text files

The following must exist in the sprint demo directory:

1. **demo-expected.json**: `description` and `durationMs`
2. **demo-readme.json**: `command`, `artifactType`, and `artifacts` array
3. **Artifact files**: the actual demo output

### validatingDemo

Run `npm run agile -- ticket validate-demo <name>` to generate a self-contained prompt. Spawn a context-free subagent with this prompt — the agent has NO access to source code or implementation context, only the demo artifacts.

The subagent writes **demo-actual.json** containing:
- `overallInterpretation`: what the demo shows in aggregate
- `artifacts`: array with `file` and `interpretation` per artifact
- `demoMatchesExpected`: boolean
- `allQuestionsAnswered`: boolean
- `validatedBy`: identifier for the validating agent

### done — human acceptance

`npm run agile -- ticket accept <name>` requires interactive terminal confirmation (type YES). This is the human gate — agents cannot complete it. The stakeholder reviews the demo artifacts and demo-actual.json, then accepts or rejects.

## Time Tracking

Each time we pick up a ticket, we log the timestamp we started working on it, and the timestamp we completed the ticket.

## Sprint Lifecycle

### Starting a sprint

1. Create the sprint: `npm run agile -- sprint create <sprint_name>`
2. Add tickets: `npm run agile -- sprint add <ticket> <sprint_name>`
3. Start the sprint: `npm run agile -- sprint start <sprint_name>`

This registers the sprint in `sprints.json` with the ticket list and estimated points.

### During a sprint

- Pick up a ticket: `npm run agile -- ticket status <ticket> inDevelopment`
- Return an incomplete ticket to backlog: `npm run agile -- sprint return <ticket> <sprint_name>`

### Completing a sprint

1. **Demo**: All tickets must have completed the demo validation process (buildingDemo → validatingDemo → done with human acceptance).

2. **Close**: Only after all demos are accepted, run `npm run agile -- sprint complete <sprint_name>`. This:
   - Calculates actual hours from Started/Completed timestamps on ticket JSON
   - Updates `sprints.json` with status `complete` and actual hours
   - Appends an entry to `velocity.json` with completed points, total points, and hours

Incomplete tickets should be returned to the backlog before completing the sprint, or they will count as unfinished points.

### Velocity tracking

Run `npm run agile -- sprint velocity` to see a report of all completed sprints, including:
- Points delivered per sprint
- Hours per sprint
- Average velocity (points/sprint, points/hour)

Velocity data is stored in `velocity.json` as an array of entries with completedPoints, totalPoints, completedTickets, totalTickets, and hours.

### Sprint Data

`sprints.json` tracks all sprints as JSON objects with name, status, ticketNames, totalPoints, completedPoints, hours, and timestamps.

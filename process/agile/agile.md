Before a sprint, we determine clear sprint goals.

Before starting a ticket, we refine the ticket, with clear acceptance criteria. We check the definition of ready before starting work, and the definition of done before completing work.

- [Definition of Ready](definitionOfReady.md)
- [Definition of Done](definitionOfDone.md)

## Ticket Format

Title format: `[feat|bugfix|task]-ESE-xxxx`

Sections:

- **Status**: `draft` | `refining` | `readyForDev` | `inDevelopment` | `inTesting` | `done`
- **Title**
- **Description**
- **Acceptance Criteria**
- **Testing Scenarios**
- **Testing Notes**
- **Size**: In story points. Initially an arbitrary estimate, which will get more accurate over time. When a ticket has subtasks, it has no points of its own — its size is the recursive sum of its subtasks.
- **Subtasks**: Tickets get broken down if they are too large. Subtask names are suffixed to their parent: e.g. `task-ESE-0001-01`, `task-ESE-0001-02`. Once a subtask gains subtasks of its own, it is promoted to a top-level ticket with the next available number. The old subtask reference in the parent is updated to point to the new ticket.
- **Started**
- **Completed**
- **Blockers**
- **Knowledge Gaps**
- **Comments**

## Time Tracking

Each time we pick up a ticket, we log the timestamp we started working on it, and the timestamp we completed the ticket.

## Sprint Lifecycle

At the beginning of a sprint, we run `sprintStart.sh`. This sums the points in the tickets in the sprint and adds a row to `sprints.csv`, which contains the following columns:

```
name,status,tickets,estimate,hours
```

At the completion of a sprint, we consult the tickets from the sprint and fill in the actual hours.

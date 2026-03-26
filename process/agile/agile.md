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
- **Size**: In story points. Initially an arbitrary estimate, which will get more accurate over time.
- **Subtasks**: Tickets get broken down if they are too large.
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

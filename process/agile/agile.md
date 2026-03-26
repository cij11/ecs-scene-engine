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

### Starting a sprint

1. Create the sprint: `npm run sprint:create -- <sprint_name>`
2. Add tickets: `npm run sprint:add -- <ticket> <sprint_name>`
3. Start the sprint: `npm run sprint:start -- <sprint_name>`

This registers the sprint in `sprints.csv` with the ticket list and estimated points.

### During a sprint

- Pick up a ticket: `npm run ticket:status -- <ticket> inDevelopment`
- Complete a ticket: `npm run ticket:status -- <ticket> done`
- Return an incomplete ticket to backlog: `npm run sprint:return -- <ticket> <sprint_name>`

### Completing a sprint

Run `npm run sprint:complete -- <sprint_name>`. This:

1. Calculates actual hours from Started/Completed timestamps on tickets
2. Updates `sprints.csv` with status `complete` and actual hours
3. Appends a row to `velocity.csv` with completed points, total points, and hours

Incomplete tickets should be returned to the backlog before completing the sprint, or they will count as unfinished points.

### Velocity tracking

Run `npm run sprint:velocity` to see a report of all completed sprints, including:
- Points delivered per sprint
- Hours per sprint
- Average velocity (points/sprint, points/hour)

Velocity data is stored in `sprints/velocity.csv`:

```
sprint,completed_points,total_points,completed_tickets,total_tickets,hours
```

### Sprint CSV

`sprints/sprints.csv` tracks all sprints:

```
name,status,tickets,estimate,hours
```

- `tickets` is a `|`-delimited list of ticket names
- `estimate` is the total story points at sprint start
- `hours` is filled in at sprint completion

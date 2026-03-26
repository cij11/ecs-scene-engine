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
- **Demo Deliverable** (feat tickets only): What the demo should show. Agreed during refinement. Must be expressive enough that an agent reviewing the demo can understand what is being demonstrated without external guidance.
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

### All tickets (feat, bugfix, task)

```
draft → refining → readyForDev → inDevelopment → inReview → inTesting → done
```

### Feature tickets (feat) — additional demo steps before done

```
... → inTesting → buildingDemo → validatingDemo → demoValidated → humanDemoValidation → done
```

### Status definitions

| Status | Description |
|--------|-------------|
| `draft` | Ticket created, not yet refined |
| `refining` | Being discussed, acceptance criteria being written |
| `readyForDev` | All fields filled, stakeholder understanding confirmed |
| `inDevelopment` | Code being written |
| `inReview` | Agent reviews code quality against acceptance criteria |
| `inTesting` | CI pipeline runs (typecheck, lint, format, tests) |
| `buildingDemo` | Demo is being built (feat only) |
| `validatingDemo` | Demo captured, agent reviewing screenshots (feat only) |
| `demoValidated` | Agent confirms demo matches expected deliverable (feat only) |
| `humanDemoValidation` | Stakeholder reviews the demo (feat only) |
| `done` | Complete |

### Gates

- **→ readyForDev**: All fields filled, Stakeholder Understanding present, Demo Deliverable present (feat only)
- **→ inReview**: Code exists for the ticket
- **→ inTesting**: CI pipeline must pass (`npm run ci`)
- **→ buildingDemo**: Tests must have passed in inTesting
- **→ validatingDemo**: demo/ directory exists with demo-expected.json and demo-readme.json
- **→ demoValidated**: demo-actual.json exists with screenshot interpretations and video interpretation. Expected demo matches actual demo.
- **→ humanDemoValidation**: Agent has validated the demo
- **→ done**: For feat tickets, human must have accepted the demo. For all tickets, CI must pass.

## Demo Process (feat tickets)

### During refinement

The parent ticket must define a **Demo Deliverable** — a description of what the demo should show. The demo must be expressive enough that an independent agent reviewing only the screenshots can understand what is being demonstrated.

If a feature is too ambitious to create a demo, or the framework required to easily produce a demo does not exist, the ticket must either be broken down into smaller tasks, or tasks must be created to build the supporting demo infrastructure.

### buildingDemo

Build the demo. A demo is a video (series of screenshots captured at 30fps) demonstrating the feature.

### validatingDemo

When transitioning to `validatingDemo`, the following must exist in the ticket's sprint demo directory:

1. **demo-expected.json**:
   - `description`: What the demo should show (from the ticket's Demo Deliverable)
   - `durationMs`: Length of the demo in milliseconds
   - `questions`: Array of questions the validator agent must answer by watching the demo. These are yes/no or short-answer questions derived from the acceptance criteria. Example: "Is there a yellow sphere at the centre of the view?", "Does the blue box orbit the yellow sphere?"

2. **demo-readme.json**:
   - `command`: The command to run the demo and capture screenshots
   - `frameCount`: Number of frames in the demo
   - `screenshots`: Array of `{ filename, timestampMs, datetimeNZ }`

### demoValidated

Before transitioning, **demo-actual.json** must exist containing:
- `screenshots`: Same as demo-readme, plus `screenshotInterpretation` for each frame — what the screenshot shows
- `videoInterpretation`: What the video shows in aggregate
- `answers`: Array matching the `questions` from demo-expected.json, each with `{ question, answer, answeredAtFrame }`. The answer is what the validator observed — not what it expects to see.
- `allQuestionsAnswered`: Boolean — true only when every question has been answered affirmatively based on what was actually observed

The reviewing agent only has access to: the screenshot files, demo-readme.json, demo-expected.json (questions only), and demo-actual.json. It does NOT have access to the source code, ticket description, or acceptance criteria. It must genuinely describe what it sees.

The demo may end early once all questions are answered correctly — the validator does not need to review every frame if all questions are resolved.

The ticket can only move to `humanDemoValidation` once all questions are answered affirmatively and the expected demo matches the actual demo.

### humanDemoValidation

The stakeholder reviews the demo and either accepts or rejects. Recorded in Demo Accepted field.

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
- Return an incomplete ticket to backlog: `npm run sprint:return -- <ticket> <sprint_name>`

### Completing a sprint

1. **Demo**: All feat tickets must have completed the demo validation process (buildingDemo → validatingDemo → demoValidated → humanDemoValidation).

2. **Close**: Only after all demos are accepted, run `npm run sprint:complete -- <sprint_name>`. This:
   - Calculates actual hours from Started/Completed timestamps on tickets
   - Updates `sprints.csv` with status `complete` and actual hours
   - Appends a row to `velocity.csv` with completed points, total points, and hours

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

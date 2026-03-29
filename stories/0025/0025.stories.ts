import { createStory } from "../_shared/create-story.js";

export default createStory({
  id: "0025",
  ticket: {
    goal: `Replace agile service and all existing agile scaffolding with a tree structure in storybook.

Each level of nesting indicates a step in the chain of command:
- Top level stories = human:agent interface (top level goals)
- Substories = agent:sub-agent interface (delegated subgoals)

When a ticket is too complex for an agent, it creates subtasks and delegates to subagents.

All stories require review:
- Code review by an agent (for everything)
- Test review output (for everything)
- Visual review with screenshots (for anything human-facing)

Ticket metadata reduced to: goal + status (refining/dev/review/done)
Numbering: 4-digit zero-padded for sorting.
No feat/task/bugfix distinction.`,
    status: "dev",
  },
});

export const Story = {};

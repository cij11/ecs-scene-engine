import { createStory } from "../../_shared/create-story.js";

export default createStory({
  id: "0000",
  parentId: "0025",
  ticket: {
    goal: `Delete the agile service and ticket JSON files.

- Remove tooling/agile-service/ entirely
- Remove process/agile/tickets/*.json
- Remove process/agile/sprints/, velocity, audit-log
- Remove agile-related npm scripts from package.json
- Clean up CLAUDE.md references to the old agile commands`,
    status: "dev",
  },
});

export const Story = {};

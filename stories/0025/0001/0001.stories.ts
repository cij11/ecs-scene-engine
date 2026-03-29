import { createStory } from "../../_shared/create-story.js";

export default createStory({
  id: "0001",
  parentId: "0025",
  ticket: {
    goal: `Migrate existing stories from old naming to 4-digit format.

- Delete all old-format story directories (feat-ESE-*, task-ESE-*)
- Existing completed work is preserved in git history
- New stories created fresh in 4-digit format as needed
- Delete old _shared helpers (create-ticket-story.ts, ticket-renderer.ts, generate-stories.ts)`,
    status: "dev",
  },
});

export const Story = {};

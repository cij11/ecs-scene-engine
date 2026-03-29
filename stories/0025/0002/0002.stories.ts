import { createStory } from "../../_shared/create-story.js";

export default createStory({
  id: "0002",
  parentId: "0025",
  ticket: {
    goal: `Update Claude memory for the new paradigm.

- Delete obsolete entries (sprint steps, sprint coach, ticket filenames, sprint dir, review transitions, demo planning, handoff summaries)
- Rewrite review enforcement: code review + test output + visual review (screenshots for human-facing)
- Rewrite workflow patterns for story-based workflow
- Create new paradigm entry: stories as agent interfaces, 4-digit numbering, goal+status, chain of command delegation`,
    status: "dev",
  },
});

export const Story = {};

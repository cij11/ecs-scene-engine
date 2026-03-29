import { createStory } from "../../_shared/create-story.js";

export default createStory({
  id: "0003",
  parentId: "0025",
  ticket: {
    goal: `Update CLAUDE.md for the new story-based workflow.

- Remove all references to agile service, npm run agile, ticket commands
- Replace with storybook-based workflow description
- Document: stories are the interface, 4-digit numbering, goal+status
- Document review requirements: code review, test output, visual review
- Document delegation: complex tasks → substories → sub-agents`,
    status: "dev",
  },
});

export const Story = {};

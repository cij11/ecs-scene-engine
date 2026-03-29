/**
 * Create a Storybook story from the new goal-based format.
 *
 * Each story represents an interface between two agents.
 * The tree structure mirrors the chain of command.
 */

export interface StoryTicket {
  goal: string;
  status: "refining" | "dev" | "review" | "done";
}

export interface StoryConfig {
  /** 4-digit story ID, e.g. "0025" */
  id: string;
  /** Parent story ID, e.g. "0025" for substory "0025/0001" */
  parentId?: string;
  /** The ticket metadata */
  ticket: StoryTicket;
}

export function createStory(config: StoryConfig) {
  const { id, parentId, ticket } = config;
  const title = parentId ? `${parentId}/${id}` : id;

  return {
    title,
    tags: ["autodocs"],
    render: () => renderStory(config),
  };
}

function renderStory(config: StoryConfig): HTMLElement {
  const { id, parentId, ticket } = config;
  const container = document.createElement("div");
  container.style.cssText = "font-family: monospace; padding: 20px; max-width: 800px;";

  const statusColors: Record<string, string> = {
    refining: "#f0ad4e",
    dev: "#5bc0de",
    review: "#d9534f",
    done: "#5cb85c",
  };

  const fullId = parentId ? `${parentId}/${id}` : id;
  const color = statusColors[ticket.status] ?? "#999";

  container.innerHTML = `
    <div style="display:flex; align-items:center; gap:12px; margin-bottom:16px;">
      <span style="background:${color}; color:#fff; padding:4px 10px; border-radius:4px; font-size:12px; text-transform:uppercase;">${ticket.status}</span>
      <span style="font-size:18px; font-weight:bold;">${fullId}</span>
    </div>
    <div style="font-size:16px; line-height:1.6; white-space:pre-wrap;">${ticket.goal}</div>
  `;

  return container;
}

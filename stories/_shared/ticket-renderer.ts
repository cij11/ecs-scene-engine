/**
 * Ticket renderer — creates an HTML element displaying a ticket's fields.
 * Used by story files to render ticket JSON as a readable card.
 */

export interface TicketData {
  name: string;
  type: string;
  title: string;
  status: string;
  description: string;
  acceptanceCriteria: string;
  demoDeliverable: string;
  testingScenarios: string;
  size: number | null;
  sizeLabel: string | null;
  subtasks: string[];
  stakeholderUnderstanding: string;
  parentName: string | null;
  started: string | null;
  completed: string | null;
  [key: string]: unknown;
}

const STATUS_COLORS: Record<string, string> = {
  refinement: "#ffa726",
  dev: "#42a5f5",
  review: "#ab47bc",
  done: "#66bb6a",
  // Legacy statuses
  inRefinement: "#ffa726",
  readyForDev: "#ffa726",
  inDevelopment: "#42a5f5",
  inTesting: "#42a5f5",
  inReview: "#ab47bc",
  buildingDemo: "#ab47bc",
  agentValidatingDemo: "#ab47bc",
  humanValidatingDemo: "#ab47bc",
};

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\n/g, "<br>");
}

function renderSection(label: string, content: string): string {
  if (!content) return "";
  return `
    <div style="margin-bottom: 16px;">
      <div style="font-weight: bold; color: #90caf9; margin-bottom: 4px; font-size: 12px; text-transform: uppercase; letter-spacing: 0.5px;">${label}</div>
      <div style="color: #ccc; line-height: 1.6; white-space: pre-wrap;">${escapeHtml(content)}</div>
    </div>
  `;
}

export function renderTicket(ticket: TicketData): HTMLElement {
  const container = document.createElement("div");
  container.style.cssText =
    "font-family: monospace; background: #1e1e1e; color: #eee; padding: 24px; border-radius: 8px; max-width: 800px;";

  const statusColor = STATUS_COLORS[ticket.status] ?? "#888";

  container.innerHTML = `
    <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 16px;">
      <div>
        <span style="color: #888; font-size: 13px;">${ticket.name}</span>
        <span style="background: #333; color: #aaa; padding: 2px 8px; border-radius: 4px; font-size: 11px; margin-left: 8px;">${ticket.type}</span>
        ${ticket.size !== null ? `<span style="background: #333; color: #aaa; padding: 2px 8px; border-radius: 4px; font-size: 11px; margin-left: 4px;">${ticket.sizeLabel ?? ticket.size}pts</span>` : ""}
      </div>
      <span style="background: ${statusColor}22; color: ${statusColor}; padding: 4px 12px; border-radius: 12px; font-size: 12px; font-weight: bold;">${ticket.status}</span>
    </div>

    <h2 style="margin: 0 0 20px 0; color: #fff; font-size: 18px;">${escapeHtml(ticket.title)}</h2>

    ${ticket.parentName ? `<div style="color: #888; font-size: 12px; margin-bottom: 12px;">Parent: ${ticket.parentName}</div>` : ""}

    ${renderSection("Description", ticket.description)}
    ${renderSection("Acceptance Criteria", ticket.acceptanceCriteria)}
    ${renderSection("Demo Deliverable", ticket.demoDeliverable)}
    ${renderSection("Testing Scenarios", ticket.testingScenarios)}
    ${renderSection("Stakeholder Understanding", ticket.stakeholderUnderstanding)}

    ${
      ticket.subtasks.length > 0
        ? `<div style="margin-bottom: 16px;">
            <div style="font-weight: bold; color: #90caf9; margin-bottom: 4px; font-size: 12px; text-transform: uppercase;">Subtasks</div>
            ${ticket.subtasks.map((s) => `<div style="color: #ccc; padding: 2px 0;">→ ${s}</div>`).join("")}
          </div>`
        : ""
    }

    ${
      ticket.started || ticket.completed
        ? `<div style="color: #666; font-size: 11px; margin-top: 16px; border-top: 1px solid #333; padding-top: 12px;">
            ${ticket.started ? `Started: ${ticket.started}` : ""}
            ${ticket.completed ? ` · Completed: ${ticket.completed}` : ""}
          </div>`
        : ""
    }
  `;

  return container;
}

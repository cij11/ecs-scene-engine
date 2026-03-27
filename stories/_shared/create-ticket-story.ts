/**
 * Helper to create a Storybook story from a ticket JSON object.
 * Usage in a .stories.ts file:
 *
 *   import ticket from './ticket.json';
 *   import { createTicketStory } from '../_shared/create-ticket-story';
 *   export default createTicketStory(ticket);
 *   export const Ticket = {};
 */

import { renderTicket } from "./ticket-renderer.js";
import type { TicketData } from "./ticket-renderer.js";

export function createTicketStory(ticket: TicketData) {
  return {
    title: buildStoryTitle(ticket),
    render: () => renderTicket(ticket),
    tags: ["autodocs"],
  };
}

function buildStoryTitle(ticket: TicketData): string {
  // Build hierarchy: "Tickets/parent-name/ticket-name"
  if (ticket.parentName) {
    return `Tickets/${ticket.parentName}/${ticket.name} ${ticket.title}`;
  }
  return `Tickets/${ticket.name} ${ticket.title}`;
}

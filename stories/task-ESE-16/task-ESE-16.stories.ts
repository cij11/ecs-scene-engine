import ticket from "../../process/agile/tickets/task-ESE-0016-add-storybook-to-project-one-story-per-ticket-matc.json";
import { renderTicket } from "../_shared/ticket-renderer.js";

export default {
  title: "Tickets/task-ESE-0016 Add Storybook to project. One story per ticket, matching ticket nesting structure",
  render: () => renderTicket(ticket),
};

export const Ticket = {};

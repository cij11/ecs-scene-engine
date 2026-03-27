import ticket from "../../process/agile/tickets/task-ESE-0007-single-source-of-truth-for-ticket-state.json";
import { renderTicket } from "../_shared/ticket-renderer.js";

export default {
  title: "Tickets/task-ESE-0007 Single source of truth for ticket state",
  render: () => renderTicket(ticket),
};

export const Ticket = {};

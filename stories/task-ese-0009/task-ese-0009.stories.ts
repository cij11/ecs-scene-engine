import ticket from "../../process/agile/tickets/task-ESE-0009-demo-ticket.json";
import { renderTicket } from "../_shared/ticket-renderer.js";

export default {
  title: "Tickets/task-ESE-0009 Demo ticket",
  render: () => renderTicket(ticket),
};

export const Ticket = {};

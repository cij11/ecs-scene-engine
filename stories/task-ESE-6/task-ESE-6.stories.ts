import ticket from "../../process/agile/tickets/task-ESE-0006-build-agile-service.json";
import { renderTicket } from "../_shared/ticket-renderer.js";

export default {
  title: "Tickets/task-ESE-0006 Build agile service",
  render: () => renderTicket(ticket),
};

export const Ticket = {};

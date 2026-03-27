import ticket from "../../process/agile/tickets/task-ESE-0014-exit-criteria-demo.json";
import { renderTicket } from "../_shared/ticket-renderer.js";

export default {
  title: "Tickets/task-ESE-0014 Exit criteria demo",
  render: () => renderTicket(ticket),
};

export const Ticket = {};

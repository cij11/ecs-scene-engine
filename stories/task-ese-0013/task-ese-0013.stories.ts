import ticket from "../../process/agile/tickets/task-ESE-0013-demo-flow-test.json";
import { renderTicket } from "../_shared/ticket-renderer.js";

export default {
  title: "Tickets/task-ESE-0013 Demo flow test",
  render: () => renderTicket(ticket),
};

export const Ticket = {};

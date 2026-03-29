import ticket from "../../../process/agile/tickets/task-ESE-0016-06-demo-hello-world-ticket-through-full-lifecycle.json";
import { renderTicket } from "../../_shared/ticket-renderer.js";

export default {
  title: "Tickets/task-ESE-0016/task-ESE-0016-06 Demo: Hello World ticket through full lifecycle",
  render: () => renderTicket(ticket),
};

export const Ticket = {};

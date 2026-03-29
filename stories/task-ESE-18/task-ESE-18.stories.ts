import ticket from "../../process/agile/tickets/task-ESE-0018-hello-world-browser-output.json";
import { renderTicket } from "../_shared/ticket-renderer.js";

export default {
  title: "Tickets/task-ESE-0018 Hello World browser output",
  render: () => renderTicket(ticket),
};

export const Ticket = {};

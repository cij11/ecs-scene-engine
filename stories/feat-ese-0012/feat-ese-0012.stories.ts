import ticket from "../../process/agile/tickets/feat-ESE-0012-gpu-compute-system-for-ecs.json";
import { renderTicket } from "../_shared/ticket-renderer.js";

export default {
  title: "Tickets/feat-ESE-0012 GPU compute system for ECS",
  render: () => renderTicket(ticket),
};

export const Ticket = {};

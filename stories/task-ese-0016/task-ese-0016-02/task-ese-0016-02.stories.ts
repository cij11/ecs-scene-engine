import ticket from "../../../process/agile/tickets/task-ESE-0016-02-create-story-directory-structure-and-ticket-render.json";
import { renderTicket } from "../../_shared/ticket-renderer.js";

export default {
  title: "Tickets/task-ESE-0016/task-ESE-0016-02 Create story directory structure and ticket renderer",
  render: () => renderTicket(ticket),
};

export const Ticket = {};

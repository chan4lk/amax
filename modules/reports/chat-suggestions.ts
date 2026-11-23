import type { ChatSuggestion } from "@amax/core";

const PAGE = [""];

export const chatSuggestions: ChatSuggestion[] = [
  { routes: PAGE, label: "How is delivery this month?", prompt: "How is delivery this month?", tool: "get_delivery_pulse" },
  { routes: PAGE, label: "Who is over-allocated?", prompt: "Who is over-allocated in the next six months?", tool: "get_delivery_pulse" },
  { routes: PAGE, label: "Who is under target?", prompt: "Who is under target this month?", tool: "show_reports" },
  { routes: PAGE, label: "Which projects are off plan?", prompt: "Which projects are off plan this month, and why?", tool: "get_delivery_pulse" },
  { routes: PAGE, label: "Download as PDF report", prompt: "Download this month as a PDF report", tool: "export_report" },
  { routes: PAGE, label: "Export as CSV", prompt: "Export the utilisation table as CSV", tool: "get_utilisation" },
];

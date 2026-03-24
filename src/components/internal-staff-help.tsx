import { DashboardHelp } from "./dashboard-help";

const content = {
  title: "How the Case Manager dashboard works",
  items: [
    "Case Stage Pipeline: Shows where each case is (e.g. docs pending, contract sent) based on current activity.",
    "Active Cases: Students assigned to you. Open a case to update profile, add notes, manage tasks and documents.",
    "Tasks: Create and assign tasks (e.g. follow up, collect docs). Update status as you progress.",
    "Documents: Upload student docs, then verify (approve/reject) once reviewed.",
    "Contracts & Invoices: Generate from templates, send to students. Mark invoices as Paid when received.",
    "Internal Notes: Add notes on a student profile. All staff on the case can see them.",
    "Agent: The Agent (sales) owns the lead. You handle operational support.",
  ],
};

export function InternalStaffHelp() {
  return <DashboardHelp content={content} />;
}

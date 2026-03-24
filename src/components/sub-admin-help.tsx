import { DashboardHelp } from "./dashboard-help";

const content = {
  title: "How the Agent dashboard works",
  items: [
    "All: View all cases assigned to you or unassigned (which you can claim).",
    "Unassigned: New leads with no agent yet. Click Claim to assign yourself.",
    "Overdue: Cases with overdue follow-ups or SLA breaches.",
    "Needs Approval: Draft contracts, invoices, or documents awaiting your review.",
    "Assign to Case Manager: Once you review a lead, assign them to a Case Manager for day-to-day support.",
    "Case Manager: Internal staff who work directly with students on documents, tasks, and follow-ups.",
  ],
};

export function SubAdminHelp() {
  return <DashboardHelp content={content} />;
}

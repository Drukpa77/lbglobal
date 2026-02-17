import type { VisaStatus } from "@prisma/client";

export const visaStatuses: VisaStatus[] = [
  "NOT_STARTED",
  "DOCUMENTS_IN_PROGRESS",
  "APPLIED",
  "INTERVIEW_SCHEDULED",
  "ADDITIONAL_DOCS_REQUESTED",
  "APPROVED",
  "REJECTED",
  "EXPIRED",
];

export function formatVisaStatus(status: VisaStatus) {
  return status
    .toLowerCase()
    .split("_")
    .map((part) => part[0].toUpperCase() + part.slice(1))
    .join(" ");
}

export function formatYearsLeft(courseEndDate?: Date | null) {
  if (!courseEndDate) return "Not set";
  const now = new Date();
  const msLeft = courseEndDate.getTime() - now.getTime();
  if (msLeft <= 0) return "Completed";
  const years = msLeft / (1000 * 60 * 60 * 24 * 365.25);
  return `${years.toFixed(1)} years`;
}

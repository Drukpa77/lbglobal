import type { SubmissionStatus } from "@prisma/client";

export const submissionStatuses: SubmissionStatus[] = [
  "SUBMITTED",
  "UNDER_REVIEW",
  "DOCS_REQUESTED",
  "OFFER_RECEIVED",
  "VISA_GRANTED",
  "REJECTED",
  "ENROLLED",
];

export function formatSubmissionStatus(status: SubmissionStatus) {
  return status
    .toLowerCase()
    .split("_")
    .map((part) => part[0].toUpperCase() + part.slice(1))
    .join(" ");
}

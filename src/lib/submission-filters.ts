import type { Prisma, Role, SubmissionStatus } from "@prisma/client";

type FilterInput = {
  role: Role;
  userId: string;
  search?: string;
  status?: string;
  country?: string;
  course?: string;
  includeUnassignedForSubAdmin?: boolean;
};

const validStatuses: SubmissionStatus[] = [
  "SUBMITTED",
  "UNDER_REVIEW",
  "DOCS_REQUESTED",
  "OFFER_RECEIVED",
  "VISA_GRANTED",
  "REJECTED",
  "ENROLLED",
];

export function buildSubmissionWhere(input: FilterInput): Prisma.QuestionnaireSubmissionWhereInput {
  const clauses: Prisma.QuestionnaireSubmissionWhereInput[] = [];
  const search = (input.search ?? "").trim();
  const country = (input.country ?? "").trim();
  const course = (input.course ?? "").trim();
  const status = (input.status ?? "").trim() as SubmissionStatus;

  if (input.role === "SUB_ADMIN") {
    if (input.includeUnassignedForSubAdmin) {
      clauses.push({ OR: [{ assignedToId: input.userId }, { assignedToId: null }] });
    } else {
      clauses.push({ assignedToId: input.userId });
    }
  }

  if (search) {
    clauses.push({
      OR: [
        { student: { name: { contains: search } } },
        { student: { email: { contains: search } } },
        { sourceCity: { contains: search } },
        { sourceCountry: { contains: search } },
        { intendedCourse: { contains: search } },
      ],
    });
  }

  if (country) {
    clauses.push({ sourceCountry: { contains: country } });
  }

  if (course) {
    clauses.push({ intendedCourse: { contains: course } });
  }

  if (validStatuses.includes(status)) {
    clauses.push({ status });
  }

  if (clauses.length === 0) {
    return {};
  }

  return { AND: clauses };
}

export function isValidStatus(value?: string | null): value is SubmissionStatus {
  if (!value) return false;
  return validStatuses.includes(value as SubmissionStatus);
}

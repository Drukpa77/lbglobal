import type { Prisma, Role, SubmissionStatus } from "@prisma/client";

type FilterInput = {
  role: Role;
  userId: string;
  search?: string;
  status?: string;
  country?: string;
  course?: string;
  inquiryLocation?: string;
  /** When true, agents also see unassigned enquiries (overview / legacy scope). */
  includeUnassignedForSubAdmin?: boolean;
  /** When `"all"`, agents see every active student submission, not only their cases. */
  subAdminScope?: "mine" | "all";
};

export type InquiryLocationFilter = "all" | "onshore" | "offshore";

export const AUSTRALIA_COUNTRY = "Australia";
const AUSTRALIA_COUNTRY_NORMALIZED = AUSTRALIA_COUNTRY.toLowerCase();

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
  const clauses: Prisma.QuestionnaireSubmissionWhereInput[] = [
    { student: { role: "USER", deletedAt: null } },
  ];
  const search = (input.search ?? "").trim();
  const country = (input.country ?? "").trim();
  const course = (input.course ?? "").trim();
  const status = (input.status ?? "").trim() as SubmissionStatus;
  const inquiryLocation = normalizeInquiryLocationFilter(input.inquiryLocation);

  if (input.role === "SUB_ADMIN" && input.subAdminScope !== "all") {
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
        { student: { studentProfile: { caseReference: { contains: search } } } },
        { sourceCity: { contains: search } },
        { sourceCountry: { contains: search } },
        { intendedCourse: { contains: search } },
      ],
    });
  }

  if (country) {
    clauses.push({ sourceCountry: { contains: country } });
  }

  const inquiryLocationWhere = buildInquiryLocationWhere(inquiryLocation);
  if (inquiryLocationWhere) {
    clauses.push(inquiryLocationWhere);
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

export function normalizeInquiryLocationFilter(
  value?: string | null,
): InquiryLocationFilter {
  return value === "onshore" || value === "offshore" ? value : "all";
}

export function buildInquiryLocationWhere(
  location: InquiryLocationFilter,
): Prisma.QuestionnaireSubmissionWhereInput | null {
  if (location === "onshore") {
    return { sourceCountry: AUSTRALIA_COUNTRY };
  }

  if (location === "offshore") {
    return {
      AND: [
        { sourceCountry: { not: null } },
        { sourceCountry: { not: AUSTRALIA_COUNTRY } },
      ],
    };
  }

  return null;
}

export function countryMatchesInquiryLocation(
  country: string | null | undefined,
  location: InquiryLocationFilter,
) {
  if (location === "all") return true;
  const normalizedCountry = country?.trim().toLowerCase();
  if (location === "onshore") {
    return normalizedCountry === AUSTRALIA_COUNTRY_NORMALIZED;
  }
  return Boolean(normalizedCountry) && normalizedCountry !== AUSTRALIA_COUNTRY_NORMALIZED;
}
